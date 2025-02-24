import matplotlib.pyplot as plt 
import squarify, numpy as np, pandas as pd 

def plot_sp500_returns_heatmap():
  df = pd.read_csv("market_caps_and_returns.csv", index_col=0)
  max_abs_return = max(abs(df['Returns'].min()), abs(df['Returns'].max()))
  norm = plt.Normalize(-max_abs_return, max_abs_return)
  colors = [plt.cm.RdBu(norm(x)) for x in df['Returns']]

  squarify.plot(
    sizes=df['MarketCap'],
    label=[f'{ticker}\n{ret:.1%}' for ticker, ret in zip(df.index, df['Returns'])],
    color=colors,
    alpha=0.8,
    text_kwargs={'fontsize': 8}
  )
  plt.show()


plot_sp500_returns_heatmap()