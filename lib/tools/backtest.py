import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
from typing import Optional

import argparse 
parser = argparse.ArgumentParser()
parser.add_argument("--long_stocks", type=str, nargs="+", default=[])
parser.add_argument("--short_stocks", type=str, nargs="+", default=[])
parser.add_argument("--long_weights", type=int, nargs="+")
parser.add_argument("--short_weights", type=int, nargs="+")
parser.add_argument("--benchmark", type=str, default="^GSPC")
parser.add_argument("--start_date", type=str, default="2023-01-01")
parser.add_argument("--end_date", type=str, default="2024-01-01")
args = parser.parse_args()


class Backtest:
  def __init__(self, 
               long_stocks: list[str], 
               short_stocks: list[str], 
               benchmark: str,
               start_date: str, 
               end_date: str, 
               long_weights: Optional[list[float]] = None, 
               short_weights: Optional[list[float]] = None):
    self.long_stocks = long_stocks
    self.short_stocks = short_stocks
    self.results = None

    if long_weights is None:
      self.long_weights = [1/len(self.long_stocks) for _ in range(len(self.long_stocks))]
    else:
      self.long_weights = [w/sum(long_weights) for w in long_weights]
      assert len(self.long_weights) == len(self.long_stocks), "Long weights must be the same length as long stocks"
      assert sum(self.long_weights) == 1, "Long weights must sum to 1"

    if short_weights is None:
      self.short_weights = [1/len(self.short_stocks) for _ in range(len(self.short_stocks))]
    else:
      self.short_weights = [w/sum(short_weights) for w in short_weights]
      assert len(self.short_weights) == len(self.short_stocks), "Short weights must be the same length as short stocks"
      assert sum(self.short_weights) == 1, "Short weights must sum to 1"

    self.start_date = start_date
    self.end_date = end_date
    self.benchmark = benchmark
  
  def fetch_data(self, tickers: list[str]) -> pd.DataFrame:
    return yf.download(tickers, start=self.start_date, end=self.end_date)['Close']
  
  def _check_results(self):
    if self.results is None:
      raise ValueError("Results are not available. Please run the backtest first.")
  
  def plot_results(self):
    self._check_results()
    self.results.plot()
  
  def save_results(self):
    self._check_results()
    self.results.to_csv("backtest.csv", index=False)

  def run(self):
    if self.long_stocks:
      long_prices = self.fetch_data(self.long_stocks)
      long_returns = long_prices / long_prices.shift(1) - 1
      long_returns.iloc[0] = 0
      long_portfolio_returns = (long_returns * self.long_weights).sum(axis=1)

    if self.short_stocks:
      short_prices = self.fetch_data(self.short_stocks)
      short_returns = short_prices / short_prices.shift(1) - 1
      short_returns.iloc[0] = 0 
      short_portfolio_returns = (short_returns * self.short_weights).sum(axis=1)

    benchmark_prices = self.fetch_data([self.benchmark])[self.benchmark]
    benchmark_returns = benchmark_prices / benchmark_prices.shift(1) - 1
    benchmark_returns.iloc[0] = 0
            
    if self.long_stocks and self.short_stocks:
      strategy_returns = long_portfolio_returns - short_portfolio_returns 
    elif len(self.long_stocks) == 0:
      strategy_returns = -short_portfolio_returns
    elif len(self.short_stocks) == 0:
      strategy_returns = long_portfolio_returns
    else:
        raise ValueError("No stocks to trade")
    
    # cumulative returns
    cum_strategy_returns = (1 + strategy_returns).cumprod() - 1
    cum_benchmark_returns = (1 + benchmark_returns).cumprod() - 1

    cum_strategy_returns.name = "Strategy Returns"
    cum_benchmark_returns.name = "Benchmark Returns"
    
    self.results = pd.concat([cum_strategy_returns, cum_benchmark_returns], axis=1)
    self.save_results()



if __name__ == "__main__":
  backtest = Backtest(long_stocks=args.long_stocks, 
                      short_stocks=args.short_stocks, 
                      long_weights=args.long_weights,
                      short_weights=args.short_weights,
                      benchmark=args.benchmark, 
                      start_date=args.start_date, 
                      end_date=args.end_date)
  backtest.run()
  backtest.plot_results()
  plt.show()