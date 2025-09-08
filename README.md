# Amber Electric Cost Comparator & Exporter

A comprehensive **browser-based tool** for analyzing your [Amber Electric](https://www.amber.com.au/) energy usage, comparing costs with traditional suppliers, and exporting detailed CSV data.

Built with [TailwindCSS](https://tailwindcss.com/) and [Chart.js](https://www.chartjs.org/) - no installation required, runs entirely in your browser.

---

## 🚀 Quick Start

### Option 1: Run Online (Recommended)
👉 **[Launch App Directly](https://rickusinggithub.github.io/Amber/)**

### Option 2: Run Locally
1. Download `index.html`
2. Open in any modern web browser
3. Enter your Amber API key and start analyzing

---

## ✨ Key Features

### 📊 **Cost Comparison Analysis**
- Compare Amber Electric costs vs traditional suppliers
- Support for both **Flat Rate** and **Time of Use (TOU)** tariffs
- Automatic calculation of demand tariffs and daily connection fees
- Visual savings summary with clear cost breakdown

### 📈 **Interactive Visualizations**
- **24-hour average usage graphs** with spot price overlays
- **Daily detailed charts** (5-minute intervals) for specific date analysis
- Separate tracking for general usage, solar feed-in, and controlled load
- Hover tooltips for detailed data points

### 💾 **Smart Data Management**
- **Intelligent caching** using IndexedDB for faster repeat queries
- **CSV export** with all channels (usage, controlled load, feed-in)
- Persistent settings storage for rate configurations
- Optimized API calls to minimize Amber API usage

### ⚡ **Advanced Features**
- **Demand tariff calculation** based on peak 30-minute usage windows
- **Solar feed-in tracking** with separate rate calculations
- **Controlled load analysis** (hot water, etc.)
- **Multi-channel support** for complex energy setups

---

## 🔧 Setup Requirements

### Essential
- **Amber Electric API key** - Get yours at [app.amber.com.au/developers](https://app.amber.com.au/developers)
- Modern web browser with JavaScript enabled

### Optional for Full Comparison
- Your traditional supplier's rate structure (flat or TOU)
- Daily connection charge details
- Solar feed-in tariff information

---

## 📋 How to Use

### 1. **Initial Configuration**
- Enter your Amber Electric API key (stored securely in your browser)
- Choose your comparison supplier's rate structure:
  - **Flat Rate**: Single rate for all usage
  - **Time of Use**: Peak/shoulder/off-peak rates with automatic time classification

### 2. **Set Rate Details**
Configure comparison rates:
- **Daily connection charges** (both suppliers)
- **Usage rates** (general, controlled load, solar feed-in)
- **TOU time periods** (automatically applied: Peak 2pm-8pm weekdays, etc.)

### 3. **Select Analysis Period**
- Choose start and end dates for comparison
- App automatically handles data fetching and caching
- Progress tracking shows API calls vs cached data usage

### 4. **Review Results**
- **Cost comparison table** with channel-by-channel breakdown
- **Savings summary** highlighting financial benefits/costs
- **Interactive graphs** for usage pattern analysis
- **CSV export** for further analysis in Excel/Google Sheets

---

## 🏗️ Technical Architecture

### Frontend Stack
- **[TailwindCSS](https://tailwindcss.com/)** - Responsive utility-first styling
- **[Chart.js](https://www.chartjs.org/)** - Interactive data visualization
- **Vanilla JavaScript** - Core functionality and API integration

### Data Management
- **IndexedDB** - Client-side caching for performance
- **Amber Electric API** - Real-time usage and pricing data
- **Smart fetching** - Minimizes API calls through intelligent caching

### Browser Storage
- **localStorage** - User preferences and API keys
- **IndexedDB** - Historical usage data cache
- **No server dependency** - Everything runs client-side

---

## 🔒 Privacy & Security

- **API keys stored locally** in your browser only
- **No data transmitted** to third-party servers
- **Client-side processing** - your data never leaves your device
- **Secure HTTPS** connection to Amber Electric API

---

## 📱 Browser Compatibility

**Supported Browsers:**
- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with ES6+ support

**Required Features:**
- IndexedDB support
- Fetch API
- ES6 JavaScript features

---

## 🎯 Use Cases

### **Individual Analysis**
- Track your energy usage patterns
- Identify peak usage times for cost optimization
- Compare actual Amber savings vs traditional suppliers
- Analyze solar generation efficiency

### **Decision Making**
- Evaluate if Amber Electric is right for your usage profile
- Understand demand charge impacts
- Optimize usage timing based on spot price patterns
- Calculate ROI for solar installations

### **Data Export**
- Export detailed usage data for tax purposes
- Create custom analyses in spreadsheet software
- Share data with energy consultants
- Archive historical usage records

---

## 🚧 Known Limitations

- **API rate limits** - Amber Electric API has usage restrictions
- **Data availability** - Limited by Amber's data retention policies
- **Comparison accuracy** - Traditional supplier calculations are estimates
- **Browser storage** - Large datasets may impact browser performance

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- **Additional supplier templates** for common Australian energy retailers
- **Enhanced visualization options** (heatmaps, seasonal analysis)
- **Mobile responsive improvements**
- **Export format options** (JSON, Excel, etc.)
- **API error handling** enhancements

### Development Setup
1. Fork the repository
2. Modify `index.html` directly
3. Test in multiple browsers
4. Submit pull requests with clear descriptions

---

## 📄 File Structure
```
├── index.html          # Complete self-contained application
├── README.md          # This documentation
└── LICENSE           # MIT License terms
```

---

## 📜 License

**MIT License** - See [LICENSE](LICENSE) for full details.

Free for personal and commercial use with attribution.

---

## 🆘 Support & Troubleshooting

### Common Issues

**"API Authentication Failed"**
- Verify your API key at [app.amber.com.au/developers](https://app.amber.com.au/developers)
- Ensure key has proper permissions
- Check for typos or extra spaces

**"No Data Available"**
- Confirm your Amber account has usage history
- Try a different date range
- Check if your site has multiple channels configured

**Slow Performance**
- Clear browser cache and IndexedDB storage
- Try smaller date ranges
- Check browser console for errors

### Getting Help
1. Check browser console for error messages
2. Verify API key permissions in Amber developer portal
3. Try the app in an incognito/private browser window
4. Open GitHub issues for bug reports

---

**💡 Tips for Best Results**
- Use recent data (last 1-3 months) for faster loading
- Compare full monthly periods for accurate cost analysis
- Export data regularly for historical tracking
- Monitor usage during different seasons for comprehensive understanding

---

*Built with ❤️ for the Australian energy community*
