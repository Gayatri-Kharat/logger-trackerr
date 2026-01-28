
# Logger Tracker (LoggerFlow)

A sophisticated observability dashboard designed for SREs and Developers to manage temporary log level overrides across distributed microservices. This application allows operators to elevate log severities (e.g., to `DEBUG` or `TRACE`) for a specific duration, after which they automatically revert to their defaults to prevent log flooding.

## 🚀 Key Features

*   **Dynamic Service Discovery**: Automatically scans target environments (OpenShift/Kubernetes clusters) via Gateway or Spring Boot Actuator endpoints to find available loggers.
*   **Time-Bounded Overrides**: Apply log levels for specific durations (e.g., "DEBUG for 10 minutes"). The UI provides visual countdowns and expiry warnings.
*   **Interactive Demo Mode**: A fully functional offline mode to simulate the UI behavior without a live backend connection.
*   **Runtime Configuration**: Supports "Build Once, Deploy Anywhere" via external configuration injection (`public/config.js`).
*   **Secure Proxying**: Includes a custom Vite proxy setup to handle CORS and SSL challenges during local development.

---

## 🛠️ Project Setup & Architecture

This project was initialized with **Vite + React + TypeScript**. We have made several architectural decisions to handle enterprise network constraints:

### 1. The Development Proxy (Vite)
To bypass CORS issues and handle self-signed certificates in development, we configured a robust proxy in `vite.config.ts`.

*   **Dynamic Routing**: We implemented a custom `/cors-proxy` endpoint. The frontend sends requests to `/cors-proxy?__target=https://actual-service-url`.
*   **Header Spoofing**: The proxy rewrites `Origin`, `Host`, and `Referer` headers to trick backend Gateways into accepting requests from `localhost`.
*   **SSL Handling**: configured with `rejectUnauthorized: false` to support internal environments with self-signed certificates.
*   **Socket Management**: Uses a custom HTTPS Agent with `keepAlive: false` to prevent "Socket Hang Up" errors common with enterprise Keycloak/Gateway setups.

### 2. Runtime Configuration
We avoid hardcoding environment URLs in the build.
*   **File**: `public/config.js`
*   **Mechanism**: This file defines `window.APP_CONFIG`.
*   **Benefit**: In a Docker/K8s deployment, this file can be overwritten via a ConfigMap *after* the React app is built, allowing the same Docker image to run in Test, Stage, and Prod.

---

## 📦 Installation & Running Locally

**Prerequisites:**
*   Node.js (v18 or higher recommended)
*   npm

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Start Development Server**
    ```bash
    npm run dev
    ```
    Access the app at `http://localhost:3000`.

3.  **Build for Production**
    ```bash
    npm run build
    ```
    Output is generated in `dist/`.

---

## 🎮 How to Use

### 1. Login / Discovery
1.  **Credentials**: Choose your Client ID and Secret (or Username/Password).
2.  **Topology**: Select the Cluster Node and Environment ID from the dropdowns.
3.  **Scan**: Click **"Scan Environment"**.
    *   *Success*: You will see a list of discovered microservices.
    *   *Failure*: An error message will appear. You can retry or choose the **"Launch Interactive Demo"** button to enter offline mode.

### 2. Dashboard Workflow
The dashboard follows a strict top-down flow:

1.  **Select Services**: Click services in the list (Top-Left) to select them.
2.  **Configure**: In the "Configuration Control" panel (Bottom-Left):
    *   Choose **Severity Level** (e.g., DEBUG).
    *   Choose **Duration** (e.g., 10m).
3.  **Apply**: Click the **Apply** button.
4.  **Monitor**: Active overrides appear in the right-hand panel with a countdown timer.

### 3. Expiry & Reset
*   When a timer expires, the dashboard notifies the user.
*   In a real implementation, the backend automatically reverts the log level.
*   Users can manually remove an override earlier by clicking the Trash icon.

---

## 🔧 Configuration Reference (`config.js`)

You can modify `public/config.js` to point to your specific infrastructure:

```javascript
window.APP_CONFIG = {
  // Template for Service Discovery URL
  API_URL_TEMPLATE: "https://amd-apigw-{env}.apps.{cluster}.domain.com",

  // Template for Auth URL
  AUTH_URL_TEMPLATE: "https://keycloak-{env}.apps.{cluster}.domain.com",

  // Define available dropdown options( For Instance )
  CLUSTERS: [ { id: 'cluster-1', name: 'Production' } ],
  ENVIRONMENTS: [ { id: 'env-1', name: 'Namespace A', clusterId: 'cluster-1' } ]
};
```

## 📁 Project Structure

*   `src/App.tsx`: Main layout and state management.
*   `src/components/Login.tsx`: Handles authentication, service discovery, and Demo Mode entry.
*   `src/services/integrationService.ts`: Handles API calls, proxy routing, and data normalization.
*   `vite.config.ts`: Advanced proxy configuration for local development.
*   `public/config.js`: Runtime configuration file.

