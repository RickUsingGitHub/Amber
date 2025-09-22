# Amber Electric Cost Comparator & Exporter

A comprehensive **browser-based tool** for analyzing your [Amber Electric](https://www.amber.com.au/) energy usage, comparing costs with traditional suppliers, and exporting detailed CSV data.

Built with [TailwindCSS](https://tailwindcss.com/) and [Chart.js](https://www.chartjs.org/) - no installation required, runs entirely in your browser.

---

## 🚀 Quick Start

### Option 1: Run Online (Recommended)
👉 **[Launch App Directly](https://rickusinggithub.github.io/Amber/)**

### Option 2: Run Locally
Download `index.html`
### Now
1. Open in any modern web browser
2. Enter your Amber API key and start analyzing

---

## ✨ Key Features

### 📊 **Cost Comparison Analysis**
- Compare Amber Electric costs vs traditional suppliers
- Support for both **Flat Rate** and **Time of Use (TOU)** tariffs
- **Pre-configured supplier templates** for major Australian retailers (EnergyAustralia, AGL, Origin, etc.)
 
  <img style="width: 50%; height: auto;" alt="image" src="https://github.com/user-attachments/assets/ce4c1c0b-407a-4fc6-bd17-46c268c190d2" />

- Visual savings summary with clear cost breakdown
 
  <img style="width: 50%; height: auto;" alt="image" src="https://github.com/user-attachments/assets/abbda961-29d0-4969-9bbe-2bc434d617b6" />


### 📈 **Interactive Visualizations**
- **24-hour average usage graphs** with spot price overlays
 
  <img style="width: 50%; height: auto;" alt="image" src="https://github.com/user-attachments/assets/faaea2a1-36ae-458b-ac0e-8edd525e98ba" />

- **Daily detailed charts** (5-minute intervals) for specific date analysis
 
  <img style="width: 50%; height: auto;" alt="image" src="https://github.com/user-attachments/assets/7918553c-2f26-4f5e-b670-ab904f63d742" />

- Separate tracking for general usage, solar feed-in, and controlled load
- Hover tooltips for detailed data points

### 🗓️ **Daily Summary Calendar**
- Detailed daily overlays of complete usage/costs.
- Complete with monthly total summaries.
 
  <img style="width: 50%; height: auto;" alt="image" src="https://github.com/user-attachments/assets/6469520e-8f8a-4167-994d-13be3c6da91d" />


### 💾 **Smart Data Management**
- **Intelligent caching** using IndexedDB for faster repeat queries
- **CSV export** with all channels (usage, controlled load, feed-in)
- **Collapsible configuration panel** for cleaner interface
- Persistent settings storage for rate configurations
- Optimized API calls to minimize Amber API usage

### ⚡ **Advanced Features**
- **Demand tariff calculation** for both Amber and comparison suppliers
- **Solar feed-in tracking** with separate rate calculations
- **Controlled load analysis** (hot water, etc.)
- **Multi-channel support** for complex energy setups
- **State-specific supplier templates** (NSW, VIC, QLD, SA)

---

## 🔧 Setup Requirements

### Essential
- **Amber Electric API key** - Get yours at [app.amber.com.au/developers](https://app.amber.com.au/developers)
- Modern web browser with JavaScript enabled

### Optional for Full Comparison
- Select from pre-configured supplier templates or enter custom rates
- Daily connection charge details
- Solar feed-in tariff information
- Demand tariff settings (if applicable)

---

## 📋 How to Use

### 1. **Initial Configuration**
- Enter your Amber Electric API key (stored securely in your browser)
- **Select your state** (NSW, VIC, QLD, SA) to load relevant supplier templates
- **Choose a supplier template** or select "Custom" for manual entry
- Configuration panel can be collapsed after setup for cleaner interface

### 2. **Set Rate Details**
Configure comparison rates (auto-filled if using templates):
- **Rate structure**: Flat Rate or Time of Use
- **Daily connection charges**
- **Usage rates** (general, peak/shoulder/off-peak for TOU, controlled load, solar feed-in)
- **Demand tariff settings** (optional, configurable time windows)

### 3. **Select Analysis Period**
- Choose start and end dates for comparison
- App automatically handles data fetching and caching
- Progress tracking shows API calls vs cached data usage
- Intelligent date range validation

### 4. **Review Results**
- **Cost comparison table** with channel-by-channel breakdown
- **Demand tariff calculations** showing peak usage times and costs
- **Savings summary** highlighting financial benefits/costs
- **Interactive graphs** showing the flow throughout the day.
- **Daily Summary Calendar** showing the flow throughout the days.
- **CSV export** for further analysis in Excel/Google Sheets

---

## 🔒 Privacy & Security

- **API keys stored locally** in your browser only
- **No data transmitted** to third-party servers
- **Client-side processing** - your data never leaves your device
- **Secure HTTPS** connection to Amber Electric API
- **Automatic settings persistence** without compromising privacy

---

## 📱 Browser Compatibility

**Supported Browsers:**
- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with ES6+ and IndexedDB support

**Required Features:**
- IndexedDB support
- Fetch API
- ES6 JavaScript features
- Chart.js compatibility

---

## 🎯 Use Cases

### **Individual Analysis**
- Track your energy usage patterns across different time periods
- Identify peak usage times for cost optimization
- Compare actual Amber savings vs traditional suppliers
- Analyze solar generation efficiency and feed-in benefits

### **Decision Making**
- Evaluate if Amber Electric is right for your usage profile
- Compare multiple supplier options using templates
- Understand demand charge impacts on your bill
- Optimize usage timing based on spot price patterns

### **Data Export & Analysis**
- Export detailed usage data for tax purposes or record keeping
- Create custom analyses in spreadsheet software
- Share data with energy consultants or solar installers
- Archive historical usage records

---

## 🚧 Known Limitations

- **API rate limits** - Amber Electric API has usage restrictions (mitigated by intelligent caching)
- **Data availability** - Limited by Amber's data retention policies
- **Comparison accuracy** - Traditional supplier calculations are estimates based on published tariffs
- **Template accuracy** - Supplier rates may change; verify current rates for precise comparisons
- **Browser storage limits** - Very large datasets may impact browser performance

---

## 🤝 Contributing

Contributions welcome! Priority areas for improvement:

### High Priority
- **Additional supplier templates** for more Australian energy retailers
- **Seasonal analysis features** (quarterly, yearly comparisons)

### Medium Priority
- **API error handling** improvements and retry logic
- **Advanced visualization options** (heatmaps, usage distribution charts)

### Low Priority
- **Multi-site support** for customers with multiple properties
- **Bill prediction features** based on usage patterns

### Development Setup
1. Fork the repository
2. Modify `index.html` directly (single-file architecture)
3. Test across multiple browsers and screen sizes
4. Submit pull requests with clear descriptions and test coverage

---

## 📁 File Structure
```
├── index.html          # Complete self-contained application
└── README.md          # This documentation
```

---

## 📜 License

**MIT License** - See [LICENSE](LICENSE) for full details.

Free for personal and commercial use with attribution.

---

## 🆘 Support & Troubleshooting

### Common Issues

**"Authentication failed. Your API Key appears to be invalid"**
- Verify your API key at [app.amber.com.au/developers](https://app.amber.com.au/developers)
- Ensure key has proper permissions for usage data access
- Check for typos or extra spaces in the key field

**"No sites found for this API key"**
- Confirm your Amber account is fully activated
- Ensure you have an active electricity connection with Amber
- Contact Amber support if the issue persists

**Slow Performance or Timeouts**
- Try smaller date ranges (1-2 weeks) for initial analysis
- Clear browser cache and IndexedDB storage
- Check browser console for specific error messages
- Use the progress log to identify bottlenecks

**Data Discrepancies**
- Verify date ranges don't extend into the future
- Check that supplier rate templates match your actual tariff
- Remember that traditional supplier costs are estimates
- Consider seasonal variations in usage patterns

### Getting Help
1. **Check browser console** for detailed error messages
2. **Review API permissions** in Amber developer portal
3. **Try incognito/private mode** to eliminate cache issues
4. **Open GitHub issues** for reproducible bugs with clear steps
5. **Check Amber's API status** page for service interruptions

---

## 💡 Tips for Best Results

### Data Analysis
- **Use full monthly periods** for accurate cost comparisons
- **Compare similar seasons** (summer vs summer) for consistency
- **Monitor demand charges** - small changes in peak usage can have big cost impacts
- **Track solar generation** patterns to optimize feed-in timing

### Performance Optimization
- **Start with recent data** (last 1-3 months) for faster initial loading
- **Export data regularly** to build historical archives
- **Use templates** instead of custom rates when possible for accuracy
- **Collapse configuration panel** after setup to reduce visual clutter

### Cost Optimization Insights
- **Identify usage patterns** that coincide with high spot prices
- **Analyze controlled load timing** for hot water optimization
- **Monitor demand windows** to avoid peak charges
- **Compare different supplier structures** to find the best fit for your profile

---

*Built for Australian energy customers seeking transparency and control over their electricity costs*
