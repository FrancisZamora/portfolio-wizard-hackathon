import { Card } from "@/components/ui/card";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Mock data - replace with real API data
const mockStockData = {
  symbol: "AAPL",
  price: 182.52,
  change: 1.23,
  changePercent: 0.68,
  buyRating: 4.2,
  high52w: 198.23,
  low52w: 124.17,
  volume: "62.3M",
  marketCap: "2.87T",
  pe: 28.4,
  dividend: 0.92,
  chartData: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    prices: [150, 155, 159, 165, 170, 182]
  }
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    y: {
      grid: {
        color: 'rgba(139, 92, 246, 0.1)',
      },
      border: {
        color: 'rgba(139, 92, 246, 0.2)',
      },
      ticks: {
        color: 'rgba(139, 92, 246, 0.8)',
      }
    },
    x: {
      grid: {
        color: 'rgba(139, 92, 246, 0.1)',
      },
      border: {
        color: 'rgba(139, 92, 246, 0.2)',
      },
      ticks: {
        color: 'rgba(139, 92, 246, 0.8)',
      }
    }
  },
  interaction: {
    intersect: false,
  },
};

export function StockPanel() {
  const chartData = {
    labels: mockStockData.chartData.labels,
    datasets: [
      {
        data: mockStockData.chartData.prices,
        borderColor: 'rgb(139, 92, 246)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  return (
    <Card className="fixed right-0 top-0 bottom-0 w-1/2 flex flex-col
                    border-l border-violet-500/20 shadow-lg
                    bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5
                    backdrop-blur-sm rounded-none p-6">
      <div className="flex items-baseline gap-4 mb-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
          {mockStockData.symbol}
        </h2>
        <div className="text-2xl font-semibold">${mockStockData.price}</div>
        <div className={`text-lg ${mockStockData.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {mockStockData.change >= 0 ? '+' : ''}{mockStockData.change} ({mockStockData.changePercent}%)
        </div>
      </div>

      <div className="h-[300px] mb-6">
        <Line options={chartOptions} data={chartData} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">Buy Rating</div>
          <div className="text-xl font-semibold flex items-center gap-2">
            {mockStockData.buyRating}
            <div className="flex">
              {[1,2,3,4,5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${star <= mockStockData.buyRating ? 'text-yellow-500' : 'text-gray-300'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">52 Week Range</div>
          <div className="text-xl font-semibold">
            ${mockStockData.low52w} - ${mockStockData.high52w}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">Volume</div>
          <div className="text-xl font-semibold">{mockStockData.volume}</div>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">Market Cap</div>
          <div className="text-xl font-semibold">{mockStockData.marketCap}</div>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">P/E Ratio</div>
          <div className="text-xl font-semibold">{mockStockData.pe}</div>
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="text-sm text-violet-300 mb-1">Dividend Yield</div>
          <div className="text-xl font-semibold">{mockStockData.dividend}%</div>
        </div>
      </div>
    </Card>
  );
} 