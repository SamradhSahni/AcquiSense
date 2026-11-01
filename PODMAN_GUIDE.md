# AcquiSense: Podman Deployment & Operations Guide
## Enterprise-Grade, Rootless & Daemonless Container Orchestration

---

## 1. Overview & Architecture

**AcquiSense** natively supports **Podman** (Pod Manager) as an enterprise alternative to Docker. 

In institutional M&A and financial due diligence, running rootless containers without a privileged background daemon (`dockerd`) significantly reduces attack surfaces, complies with strict SOC 2 / ISO 27001 data isolation policies, and provides a direct path to Kubernetes.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          3 WAYS TO DEPLOY ACQUISENSE ON PODMAN                         │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 1. PODMAN COMPOSE        │ 2. NATIVE KUBERNETES PLAY   │ 3. SYSTEMD QUADLETS           │
│ (Best for Local Dev)     │ (Best for Staging / K8s)    │ (Best for Enterprise Linux)   │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • podman-compose.yml     │ • podman-k8s.yaml           │ • infra/podman/quadlets/      │
│ • Drop-in Docker parity  │ • podman play kube          │ • systemctl --user start      │
│ • Netavark DNS bridge    │ • Shared localhost pod      │ • Auto-restart on host boot   │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. Installing Podman

### Windows
1. **Using Winget (Recommended)**:
   ```powershell
   winget install RedHat.Podman-Desktop
   # OR for CLI only:
   winget install RedHat.Podman
   ```
2. **Initialize and Start the Podman Machine (WSL2)**:
   ```powershell
   podman machine init
   podman machine start
   ```

### macOS
```bash
brew install podman podman-compose
podman machine init
podman machine start
```

### Linux (RHEL / Rocky / Fedora / CentOS)
```bash
sudo dnf install -y podman podman-compose
```

### Linux (Ubuntu / Debian)
```bash
sudo apt-get update
sudo apt-get install -y podman podman-compose
```

---

## 3. Deployment Method 1: Podman Compose (Recommended for Dev & Testing)

AcquiSense includes a dedicated, SELinux-hardened `podman-compose.yml` file.

### 3.1 Start Services
From the project root:

#### Windows (PowerShell):
```powershell
# Using the automated helper:
.\scripts\podman-up.ps1

# Or manually:
podman compose -f podman-compose.yml up -d --build
```

#### Linux / macOS:
```bash
# Using the automated helper:
chmod +x scripts/*.sh
./scripts/podman-up.sh

# Or manually:
podman compose -f podman-compose.yml up -d --build
```

### 3.2 Verify Container Health
```bash
podman compose -f podman-compose.yml ps
```

### 3.3 Tear Down
```bash
# Windows
.\scripts\podman-down.ps1

# Linux / macOS
./scripts/podman-down.sh
```

---

## 4. Deployment Method 2: Native Kubernetes Playbook (`podman play kube`)

Podman features native support for Kubernetes YAML without requiring minikube or k8s clusters. All 7 microservices run in a single **Podman Pod** sharing a unified network namespace (`localhost`).

### 4.1 Build Local Images
Before running the Kubernetes manifest, build the three custom images:
```bash
podman build -t localhost/acquisense-backend:latest ./backend
podman build -t localhost/acquisense-server:latest ./server
podman build -t localhost/acquisense-client:latest ./client
```

### 4.2 Launch the Podman Pod
```bash
podman play kube podman-k8s.yaml
```

### 4.3 Inspect the Pod
```bash
# View active pod and containers
podman pod ps
podman ps --pod

# View pod logs
podman pod logs acquisense-pod
```

### 4.4 Stop and Remove the Pod
```bash
podman play kube --down podman-k8s.yaml
```

---

## 5. Deployment Method 3: Enterprise Linux Systemd Quadlets

For production virtual machines running Red Hat Enterprise Linux (RHEL), Rocky Linux, Fedora, or Ubuntu, Podman **Quadlets** translate container specifications directly into native `systemd` unit files.

### 5.1 Copy Quadlet Definitions
As a standard unprivileged user on your Linux server:
```bash
mkdir -p ~/.config/containers/systemd/
cp infra/podman/quadlets/* ~/.config/containers/systemd/
```

### 5.2 Build Images
```bash
podman build -t localhost/acquisense-backend:latest ./backend
podman build -t localhost/acquisense-server:latest ./server
podman build -t localhost/acquisense-client:latest ./client
```

### 5.3 Reload Systemd and Start Platform
```bash
# Reload systemd generator to create service units from quadlets
systemctl --user daemon-reload

# Start the unified AcquiSense pod (dependencies start automatically)
systemctl --user start acquisense.pod

# Verify status
systemctl --user status acquisense.pod
```

### 5.4 Enable Auto-Start on Host Boot (Linger)
To allow rootless containers to start and run even when the user is not logged in:
```bash
loginctl enable-linger $USER
```

---

## 6. Port Mapping & Service Directory

| Service | Host Port | Internal Port | Protocol | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Client (React)** | `5173` | `3000` | HTTP | Web UI Forensic Dashboard |
| **Node.js Gateway** | `4100` | `4000` | HTTP / WS | REST API, BullMQ & WebSockets |
| **Python AI Engine** | `8100` | `8000` | HTTP | AI Pipeline & OpenAPI Docs (`/docs`) |
| **Grafana** | `3200` | `3001` | HTTP | Telemetry Dashboards (`admin` / `grafanapassword`) |
| **Prometheus** | `9190` | `9090` | HTTP | Time-Series Metrics Scraper |
| **MongoDB** | `27117` | `27017` | TCP | Document Store (`ddadmin` / `ddpassword`) |
| **Redis** | `6479` | `6379` | TCP | Cache, Pub/Sub & BullMQ Queue |

---

## 7. Troubleshooting & Best Practices for Podman

### 1. SELinux `Permission Denied` on Volume Mounts
- **Cause**: On SELinux-enforcing hosts, container processes cannot access host files without proper security context labels.
- **Solution**: All volume bind-mounts in `podman-compose.yml` and `podman-k8s.yaml` include the `:z` flag (shared container label). If creating manual mounts, always append `:z`:
  ```bash
  -v ./data:/app/data:z
  ```

### 2. Rootless User Namespaces & SubUIDs
- If running rootless Podman on Linux, ensure your user has allocated subordinate UIDs and GIDs:
  ```bash
  cat /etc/subuid
  cat /etc/subgid
  # If missing, add:
  sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER
  ```

### 3. DNS Resolution (`netavark` vs `cni`)
- Ensure Podman is configured with the modern `netavark` network backend (standard in Podman 4+):
  ```bash
  podman info --format '{{.Host.NetworkBackend}}'
  # Should output: netavark
  ```

### 4. Podman Machine Memory Allocation (Windows & macOS)
Because the 9 domain AI agents process multiple PDF and Excel files concurrently, allocate at least 4 GB of RAM to the Podman VM:
```powershell
podman machine stop
podman machine set --memory 4096 --cpus 4
podman machine start
```

