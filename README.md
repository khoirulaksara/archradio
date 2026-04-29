# ⋆ Arch Radio ⋆

<p align="center">
  <img src="src-tauri/assets/Screenshot 2026-04-29 131214.png" width="80%" alt="Arch Radio Preview" />
</p>

<p align="center">
  <img src="src-tauri/assets/Screenshot 2026-04-29 131229.png" width="30%" alt="Widget Preview 1" />
  <img src="src-tauri/assets/Screenshot 2026-04-29 131236.png" width="30%" alt="Widget Preview 2" />
  <img src="src-tauri/assets/Screenshot 2026-04-29 131248.png" width="30%" alt="Widget Preview 3" />
</p>

A premium, high-fidelity desktop radio player built with **Tauri v2**, **Rust**, and **Vanilla Web Technologies**. Arch Radio provides a modern listening experience with a focus on aesthetics, performance, and deep OS integration.

## ✨ Key Features

- **💎 Glassmorphism UI**: A stunning, modern interface with real-time blur effects and sleek dark-mode aesthetics.
- **📟 Compact Taskbar Widget**: A semi-transparent mini-player that sits perfectly above your taskbar, keeping your music controls always within reach without cluttering your workspace.
- **🎨 Adaptive Branding**: The application dynamically extracts colors from the current radio station's logo to theme the entire UI (buttons, glow, and marquee).
- **🔄 Animated Tray Tooltip**: Industry-first simulated marquee for System Tray tooltips, showing live scrolling song information directly from the tray icon.
- **🎚️ Audio Normalizer**: Built-in audio processing to ensure consistent volume levels across different radio streams.
- **📊 Real-time Visualizer**: Smooth, high-performance audio frequency visualizer.
- **🚀 Native Performance**: Extremely low memory footprint and high performance thanks to the Rust backend.

## 🛠️ Tech Stack

- **Backend**: Rust (Tauri v2)
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript
- **Audio Processing**: Web Audio API
- **System Integration**: Native Windows API calls via Rust

## 🚀 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/khoirulaksara/archradio.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build for production:
   ```bash
   npm run tauri build
   ```

## 📜 License
This project is licensed under the MIT License.

---
Built with ❤️ by [Khoirul Aksara](https://github.com/khoirulaksara)
