# Amber Electric Cost Comparator & Exporter

A simple **browser-based app** for visualising your [Amber Electric](https://www.amber.com.au/) energy usage and exporting detailed CSV data.  

Built with [TailwindCSS](https://tailwindcss.com/) and [Chart.js](https://www.chartjs.org/).  
No installation needed — just open in your browser.

---

## 🚀 Try It Now

👉 Run directly from GitHub Pages:  
[https://rickusinggithub.github.io/Amber/](https://rickusinggithub.github.io/Amber/)

or download index.html and run locally.

---

## ✨ Features

- 📊 **Interactive graphs**
  - Daily usage breakdown
  - 24-hour average usage
  - Spot price overlay
  - Controlled Load shown only if data exists

- 📥 **CSV export**
  - Exports **all channels** (usage, controlled load, feed-in, etc.)
  - Includes: `nemTime`, `channelIdentifier`, `kWh`, `SpotPrice_cents_per_kWh`
- ⚡ **Amber API support**
  - Fetches data directly from your Amber account via API key
- 🖥️ **Self-contained**
  - Runs 100% client-side in the browser — no backend required

---

## 📂 File Structure
├── index.html # Main app (self-contained)

├── README.md # This file

---

## 🔑 Requirements

- A valid **Amber Electric API key**  
- A modern web browser with JavaScript enabled  

---

## 🛠️ Tech Stack

- **[TailwindCSS](https://tailwindcss.com/)** – styling  
- **[Chart.js](https://www.chartjs.org/)** – charting  
- **Vanilla JavaScript** – API calls, data handling, CSV export  

---

## 🖼️ Screenshots

  <img width="1268" height="1065" alt="image" src="https://github.com/user-attachments/assets/fed19330-a39c-4b6b-ac56-32a36358f541" />


---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.

---

💡 Contributions welcome! Feel free to fork, open issues, or send pull requests.
