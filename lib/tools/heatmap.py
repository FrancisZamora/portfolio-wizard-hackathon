import squarify
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import io
import base64
import sys
import yfinance as yf
import os

# Configure matplotlib for non-interactive backend
plt.switch_backend('Agg')

def get_sp500_data():
    """Fetch S&P 500 components data and calculate returns."""
    try:
        # Get S&P 500 data from Wikipedia
        sp500_url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        sp500_table = pd.read_html(sp500_url)[0]
        symbols = sp500_table['Symbol'].tolist()

        # Initialize data storage
        market_caps = []
        returns = []
        valid_symbols = []

        # Fetch data for each symbol
        print("Fetching market data...", file=sys.stderr)
        for symbol in symbols[:50]:  # Limit to 50 companies for faster response
            try:
                stock = yf.Ticker(symbol)
                hist = stock.history(period="1mo")
                if not hist.empty:
                    market_cap = stock.info.get('marketCap', 0)
                    if market_cap > 0:
                        returns_val = (hist['Close'].iloc[-1] / hist['Close'].iloc[0] - 1)
                        market_caps.append(market_cap)
                        returns.append(returns_val)
                        valid_symbols.append(symbol)
            except Exception as e:
                print(f"Error fetching {symbol}: {str(e)}", file=sys.stderr)
                continue

        # Create DataFrame
        df = pd.DataFrame({
            'Symbol': valid_symbols,
            'MarketCap': market_caps,
            'Returns': returns
        })

        # Sort by market cap
        df = df.sort_values('MarketCap', ascending=False)
        
        # Save to CSV
        df.to_csv("market_caps_and_returns.csv")
        print("Market data saved to CSV", file=sys.stderr)
        return True

    except Exception as e:
        print(f"Error getting S&P 500 data: {str(e)}", file=sys.stderr)
        return False

def plot_sp500_returns_heatmap():
    """Generate a heatmap visualization of S&P 500 returns."""
    try:
        # Check if we have the data file
        if not os.path.exists("market_caps_and_returns.csv"):
            print("Data file not found, fetching new data...", file=sys.stderr)
            if not get_sp500_data():
                raise Exception("Failed to fetch market data")
        
        try:
            # Try to read existing data file
            df = pd.read_csv("market_caps_and_returns.csv")
            if df.empty:
                raise Exception("Empty data file")
        except Exception as e:
            print(f"Error reading data file: {str(e)}, fetching new data...", file=sys.stderr)
            if not get_sp500_data():
                raise Exception("Failed to fetch market data")
            df = pd.read_csv("market_caps_and_returns.csv")

        # Create figure with specific size
        plt.figure(figsize=(15, 10))
        
        # Normalize colors based on returns
        max_abs_return = max(abs(df['Returns'].min()), abs(df['Returns'].max()))
        norm = plt.Normalize(-max_abs_return, max_abs_return)
        colors = [plt.cm.RdBu(norm(x)) for x in df['Returns']]

        # Format labels with ticker and return percentage
        labels = [f'{symbol}\n{ret:+.1%}' for symbol, ret in zip(df['Symbol'], df['Returns'])]

        # Create treemap with adjusted text size and padding
        squarify.plot(
            sizes=df['MarketCap'],
            label=labels,
            color=colors,
            alpha=0.7,
            pad=True,
            text_kwargs={
                'fontsize': 10,
                'fontweight': 'bold',
                'color': 'white',
                'path_effects': [
                    plt.matplotlib.patheffects.withStroke(
                        linewidth=2, 
                        foreground='black'
                    )
                ]
            }
        )
        
        plt.title('S&P 500 Market Cap & Returns Heatmap', fontsize=14, pad=20)
        plt.axis('off')
        
        # Add a colorbar
        sm = plt.cm.ScalarMappable(cmap=plt.cm.RdBu, norm=norm)
        sm.set_array([])
        cbar = plt.colorbar(sm)
        cbar.set_label('Returns %', fontsize=10)
        
        # Save plot to base64 string
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', dpi=300, facecolor='white')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        return image_base64

    except Exception as e:
        print(f"Error generating heatmap: {str(e)}", file=sys.stderr)
        # Try to fetch fresh data and generate again
        try:
            if get_sp500_data():
                return plot_sp500_returns_heatmap()  # Retry once with fresh data
        except Exception as retry_error:
            print(f"Error in retry attempt: {str(retry_error)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        image_base64 = plot_sp500_returns_heatmap()
        print(image_base64)  # This will be captured by the Node.js process
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)