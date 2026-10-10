const http = require("node:http");

const stagePage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self';">
  <title>StageDesk Presentation</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { display: grid; place-items: center; overflow: hidden; color: white; background: transparent; font-family: Arial, Helvetica, sans-serif; }
    main { width: 88%; text-align: center; white-space: pre-line; text-shadow: 0 3px 24px #0008; }
    .project { margin: 0 0 2vh; color: #ffffffb8; font-size: 1.4vw; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0 0 2vh; font-size: 6vw; font-weight: 600; line-height: 1.08; }
    .body { margin: 0; font-size: 3vw; line-height: 1.4; }
  </style>
</head>
<body>
  <main aria-live="polite">
    <p class="project"></p>
    <h1></h1>
    <p class="body"></p>
  </main>
  <script>
    const project = document.querySelector(".project");
    const title = document.querySelector("h1");
    const body = document.querySelector(".body");
    let lastState = "";
    async function update() {
      try {
        const response = await fetch("/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Stage state unavailable");
        const state = await response.json();
        const serialized = JSON.stringify(state);
        if (serialized === lastState) return;
        lastState = serialized;
        const slide = state.slide;
        document.body.style.backgroundColor = slide?.background || "transparent";
        document.querySelector("main").style.textAlign = slide?.textAlign || "center";
        document.querySelector("main").style.color = slide?.textColor || "#ffffff";
        title.style.fontSize = (slide?.fontSize || 96) + "px";
        title.style.color = slide?.textColor || "#ffffff";
        body.style.fontSize = Math.round((slide?.fontSize || 48) / 2) + "px";
        body.style.color = slide?.textColor || "#ffffff";
        project.textContent = slide ? state.projectName : "";
        title.textContent = slide?.title || "";
        body.textContent = slide?.body || "";
        document.body.style.visibility = "visible";
      } catch {
        document.body.style.visibility = "hidden";
      }
    }
    document.body.style.visibility = "hidden";
    update();
    setInterval(update, 250);
  </script>
</body>
</html>`;

function createStageServer() {
  let latestState = null;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    if (pathname === "/state") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(latestState));
      return;
    }
    if (pathname === "/" || pathname === "/stage") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(stagePage);
      return;
    }
    response.writeHead(404).end("Not found");
  });

  return {
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("The StageDesk presentation server did not start."));
            return;
          }
          resolve(`http://127.0.0.1:${address.port}/stage`);
        });
      }),
    publish: (state) => {
      latestState = state;
    },
    close: () =>
      new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

module.exports = { createStageServer };
