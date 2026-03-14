# Among Us in Minecraft Logs – Server

This repository contains the **Node.js server** for storing and serving **ActionLogs** created by
the [Among Us in Minecraft](https://github.com/Fantamomo/among-us-in-minecraft) plugin.

---

## This repository is under construction.

**_The following features and the features that are planned but currently not or not fully implemented._**

---

## Features

* **Remote Log Upload:** The plugin uploads logs to the server after a game ends.
* **Unique Access Codes:** Each log is assigned a unique 16-character hexadecimal code (`^[a-f0-9]{16}$`).
* **Web Interface:** Players can view detailed game information directly in the browser.
* **Download Option:** Logs can be downloaded as JSON for offline analysis.
* **Automatic Indexing:** Logs are automatically stored and linked once uploaded.
* **Only one hour:** The logs are stored for one hour before being deleted.

---

## How It Works

1. **Log Generation:** The Among Us in Minecraft plugin creates an ActionLog and add any relevant information.
2. **Upload to Server:** After the game, the plugin uploads the log to this Node.js server.
3. **Server Processing:** The server stores the log and assigns a **unique 16-character code**.
4. **Player Access:**
    * **Web Interface:** `http://<server>/log/<code>` — shows a detailed replay of the game with all actions, tasks,
      votes, and chat.
    * **Download JSON:** `http://<server>/raw/<code>` — allows the player to download the raw JSON file.

---

## Author

[Fantamomo](https://github.com/Fantamomo)