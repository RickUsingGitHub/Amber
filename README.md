# Amber Electric Cost Comparator & Exporter

A simple web app for visualising your **Amber Electric** energy usage and exporting detailed CSV data.  
Built with [TailwindCSS](https://tailwindcss.com/) and [Chart.js](https://www.chartjs.org/).

## ✨ Features

- 📊 **Interactive graphs**
  - Daily usage breakdown
  - 24-hour average usage
  - Spot price overlay
  - Controlled Load shown only if data exists
- 📥 **CSV export**
  - Exports **all channels** (usage, controlled load, feed-in, etc.)
  - Includes `nemTime`, `channelIdentifier`, `kWh`, and `SpotPrice_cents_per_kWh`
- ⚡ **Amber API support**
  - Fetches directly from your Amber account via API key
- 🖥️ **Self-contained**
  - Runs in the browser, no backend required

## 🚀 Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/yourusername/amber-comparator.git
   cd amber-comparator
