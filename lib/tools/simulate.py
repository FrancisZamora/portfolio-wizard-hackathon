import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import io
import base64
import argparse
import sys
from datetime import datetime, timedelta

def get_default_dates():
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=5*365)).strftime("%Y-%m-%d")
    return start_date, end_date

def format_crypto_symbol(symbol: str) -> str:
    """Format cryptocurrency symbols for yfinance."""
    # Common cryptocurrency mappings
    crypto_mappings = {
        "BTC": "BTC-USD",
        "BITCOIN": "BTC-USD",
        "ETH": "ETH-USD",
        "ETHEREUM": "ETH-USD",
        "DOGE": "DOGE-USD",
        "XRP": "XRP-USD",
        "SOL": "SOL-USD",
        "ADA": "ADA-USD",
    }
    
    # Normalize the input symbol
    symbol = symbol.upper().strip()
    
    # If it's in our mappings, use the mapped version
    if symbol in crypto_mappings:
        return crypto_mappings[symbol]
    
    # If it already has -USD suffix, return as is
    if symbol.endswith("-USD"):
        return symbol
        
    # For other potential crypto symbols, add -USD suffix
    if len(symbol) <= 5:  # Most crypto symbols are 3-5 characters
        return f"{symbol}-USD"
        
    return symbol

def simulate(stock: str, growth_rate: float, start_date: str = None, end_date: str = None, visualize: bool = True) -> str:
    """
    Simulate a stock's price growth given a fixed YoY percentage increase.
    
    Parameters:
      stock (str): The ticker symbol of the stock to simulate.
      growth_rate (float): The annual percentage growth rate (e.g., 10 for 10%).
      start_date (str): The start date for fetching historical data (format 'YYYY-MM-DD').
      end_date (str): The end date for fetching historical data (format 'YYYY-MM-DD').
      visualize (bool): If True, returns a base64-encoded PNG of the plot.
      
    Returns:
      str: Base64-encoded image string if visualize is True; otherwise, returns an empty string.
    """
    start_date = start_date or get_default_dates()[0]
    end_date = end_date or get_default_dates()[1]
    
    # Format the symbol if it's a cryptocurrency
    formatted_symbol = format_crypto_symbol(stock)
    
    try:
        # Fetch historical closing prices for the given stock/crypto
        df = yf.download(formatted_symbol, start=start_date, end=end_date)
        if df.empty:
            raise ValueError(f"No data found for ticker {formatted_symbol}")
        
        # Extract closing prices and ensure index is datetime
        actual_prices = df['Close']
        dates = actual_prices.index
        
        # Get initial price for simulation
        initial_price = actual_prices.iloc[0]
        
        # Calculate days elapsed as float values
        start_date = dates[0]
        days_elapsed = [(date - start_date).days for date in dates]
        
        # Calculate growth factor for each day
        annual_factor = 1 + (growth_rate / 100)
        daily_factors = [annual_factor ** (day / 365) for day in days_elapsed]
        
        # Calculate simulated prices
        simulated_prices = [initial_price * factor for factor in daily_factors]
        
        if visualize:
            plt.figure(figsize=(12, 6))
            
            # Plot actual prices
            plt.plot(dates, actual_prices.values, 
                    label=f"Actual Price ({stock})", 
                    color="#8B5CF6")
            
            # Plot simulated prices
            plt.plot(dates, simulated_prices,
                    label=f"Simulated Price ({growth_rate}% YoY Growth)",
                    color="#F472B6",
                    linestyle="--")
            
            plt.title(f"Actual vs. Simulated Price for {stock}")
            plt.xlabel("Date")
            plt.ylabel("Price")
            plt.legend()
            plt.grid(True, alpha=0.3)
            
            # Format y-axis with commas for thousands
            plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: format(int(x), ',')))
            
            # Save plot to buffer
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', bbox_inches='tight', dpi=300)
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            plt.close()
            
            return image_base64
        else:
            return ""
            
    except Exception as e:
        raise ValueError(f"Error simulating {formatted_symbol}: {str(e)}")

if __name__ == "__main__":
    default_start, default_end = get_default_dates()
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--stock", type=str, required=True, help="Stock symbol to simulate")
    parser.add_argument("--growth_rate", type=float, required=True, help="Annual growth rate percentage")
    parser.add_argument("--start_date", type=str, default=default_start, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end_date", type=str, default=default_end, help="End date (YYYY-MM-DD)")
    args = parser.parse_args()

    try:
        image_base64 = simulate(
            stock=args.stock,
            growth_rate=args.growth_rate,
            start_date=args.start_date,
            end_date=args.end_date
        )
        print(image_base64)  # This will be captured by the Node.js process
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
