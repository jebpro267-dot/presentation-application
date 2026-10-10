import { OBSWebSocket } from "obs-websocket-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importSlides } from "../content/importSlides";
import type { Project, ProjectionDisplay, Scene, Slide, StageState } from "../types";

const initialProject: Project = {
  version: 1,
  name: "Untitled Show",
  scenes: [
    {
      id: "wide",
      name: "Wide camera",
      color: "#263c52",
      description: "Main camera and presentation",
    },
    {
      id: "stage",
      name: "Stage",
      color: "#483346",
      description: "Full stage view",
    },
    {
      id: "welcome",
      name: "Welcome",
      color: "#2f493f",
      description: "Welcome screen",
    },
  ],
  slides: [
    {
      id: "welcome-slide",
      title: "Welcome",
      body: "We are glad you are here.",
      background: "#213c35",
    },
    {
      id: "song-slide",
      title: "Your song title",
      body: "Add a lyric, a line of text,\nor a presentation note here.",
      background: "#26394d",
    },
    {
      id: "announcements",
      title: "Announcements",
      body: "Add today's announcements.",
      background: "#45374e",
    },
  ],
  currentSceneId: "wide",
  liveSlideId: "welcome-slide",
};

type WorkspacePage = "presentation" | "obs" | "live";
type ContentFilter = "all" | "slide" | "song" | "scripture";
type PtzRange = { min: number; max: number; step?: number };
type PtzCapabilities = { pan?: PtzRange; tilt?: PtzRange; zoom?: PtzRange };
type PtzSettings = { pan?: number; tilt?: number; zoom?: number };

type ObsScene = {
  name: string;
  uuid: string;
};

type ObsSceneSource = {
  id: number;
  name: string;
  enabled: boolean;
  kind: string;
};

type ObsOutputStatus = {
  active: boolean;
  timecode: string;
};

type ObsAudioInput = {
  name: string;
  volume: number;
  muted: boolean;
};

function readObsNames(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error("OBS returned an invalid list.");
  }
  return value.flatMap((entry) =>
    entry !== null &&
    typeof entry === "object" &&
    key in entry &&
    typeof entry[key] === "string"
      ? [entry[key]]
      : [],
  );
}

function CameraController() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [cameraName, setCameraName] = useState("");
  const [error, setError] = useState("");
  const [ptz, setPtz] = useState<{
    pan?: PtzRange;
    tilt?: PtzRange;
    zoom?: PtzRange;
  }>({});
  const [ptzValues, setPtzValues] = useState({ pan: 0, tilt: 0, zoom: 1 });

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const refreshCameras = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const available = devices.filter((device) => device.kind === "videoinput");
    setCameras(available);
    if (!cameraId && available[0]) setCameraId(available[0].deviceId);
  };

  const startCamera = async (deviceId = cameraId) => {
    setError("");
    stopCamera();
    try {
      let available = cameras;
      if (available.length === 0) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
        available = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "videoinput",
        );
        permissionStream.getTracks().forEach((track) => track.stop());
        setCameras(available);
        deviceId = deviceId || available[0]?.deviceId || "";
      }
      if (!deviceId) {
        throw new Error("No camera is available. Connect a camera and try again.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          pan: true,
          tilt: true,
          zoom: true,
        } as MediaTrackConstraints,
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      setCameraName(track.label || "Camera");
      setCameraId(deviceId);
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & PtzCapabilities;
      const settings = track.getSettings() as MediaTrackSettings & PtzSettings;
      setPtz({
        pan: capabilities.pan,
        tilt: capabilities.tilt,
        zoom: capabilities.zoom,
      });
      setPtzValues({
        pan: settings.pan ?? 0,
        tilt: settings.tilt ?? 0,
        zoom: settings.zoom ?? capabilities.zoom?.min ?? 1,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not access the selected camera. Check device permissions.",
      );
    }
  };

  const setCameraControl = async (
    name: "pan" | "tilt" | "zoom",
    value: number,
  ) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ [name]: value } as MediaTrackConstraintSet],
      });
      setPtzValues((current) => ({ ...current, [name]: value }));
    } catch (cause) {
      setError(
        `${name} control failed: ${cause instanceof Error ? cause.message : "This camera does not support the requested control."}`,
      );
    }
  };

  const stop = () => {
    stopCamera();
    setCameraName("");
    setPtz({});
  };

  return (
    <section className="camera-controller">
      <div className="camera-preview">
        <video ref={videoRef} autoPlay muted playsInline />
        {!cameraName && <span>Camera preview is off</span>}
        {cameraName && <small>{cameraName}</small>}
      </div>
      <div className="camera-actions">
        <label>
          <span>CAMERA</span>
          <select
            value={cameraId}
            onFocus={() => void refreshCameras().catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : "Could not list cameras."),
            )}
            onChange={(event) => {
              setCameraId(event.target.value);
              if (streamRef.current) void startCamera(event.target.value);
            }}
          >
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${index + 1}`}
              </option>
            ))}
            {cameras.length === 0 && <option value="">Discover cameras…</option>}
          </select>
        </label>
        {cameraName ? (
          <button className="button quiet" onClick={stop}>Stop preview</button>
        ) : (
          <button className="button primary" onClick={() => void startCamera()}>Start camera</button>
        )}
      </div>
      <div className="ptz-controls">
        {(["pan", "tilt", "zoom"] as const).map((name) => {
          const range = ptz[name];
          return (
            <label className={range ? "" : "ptz-unavailable"} key={name}>
              <span>{name.toUpperCase()} {range ? Math.round(ptzValues[name]) : "NOT SUPPORTED"}</span>
              <input
                type="range"
                min={range?.min ?? 0}
                max={range?.max ?? 1}
                step={range?.step || 1}
                value={range ? ptzValues[name] : 0}
                disabled={!range || !cameraName}
                onChange={(event) =>
                  void setCameraControl(name, Number(event.target.value))
                }
              />
            </label>
          );
        })}
      </div>
      <p className="camera-footnote">
        PTZ sliders appear when your camera and operating system expose standard
        pan/tilt/zoom controls. OBS device capture stays configured in OBS Studio.
      </p>
      {error && <p className="camera-error" role="alert">{error}</p>}
    </section>
  );
}

function readObsScenes(value: unknown): ObsScene[] {
  if (!Array.isArray(value)) {
    throw new Error("OBS returned an invalid scene list.");
  }
  return value.flatMap((entry) => {
    if (
      entry !== null &&
      typeof entry === "object" &&
      "sceneName" in entry &&
      typeof entry.sceneName === "string" &&
      "sceneUuid" in entry &&
      typeof entry.sceneUuid === "string"
    ) {
      return [{ name: entry.sceneName, uuid: entry.sceneUuid }];
    }
    return [];
  });
}

function readObsSceneSources(value: unknown): ObsSceneSource[] {
  if (!Array.isArray(value)) {
    throw new Error("OBS returned an invalid source list.");
  }
  return value.flatMap((entry) => {
    if (
      entry !== null &&
      typeof entry === "object" &&
      "sceneItemId" in entry &&
      typeof entry.sceneItemId === "number" &&
      "sourceName" in entry &&
      typeof entry.sourceName === "string" &&
      "sceneItemEnabled" in entry &&
      typeof entry.sceneItemEnabled === "boolean"
    ) {
      return [{
        id: entry.sceneItemId,
        name: entry.sourceName,
        enabled: entry.sceneItemEnabled,
        kind: "sourceKind" in entry && typeof entry.sourceKind === "string"
          ? entry.sourceKind
          : "OBS source",
      }];
    }
    return [];
  });
}

function ObsStudioPanel({ mode }: { mode: "obs" | "live" | "hidden" }) {
  const clientRef = useRef<OBSWebSocket | null>(null);
  const [server, setServer] = useState(
    () => localStorage.getItem("stagedesk.obs.server") ?? "ws://127.0.0.1:4455",
  );
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scenes, setScenes] = useState<ObsScene[]>([]);
  const [sources, setSources] = useState<ObsSceneSource[]>([]);
  const [inputKinds, setInputKinds] = useState<string[]>([]);
  const [selectedInputKind, setSelectedInputKind] = useState("");
  const [newInputName, setNewInputName] = useState("");
  const [currentScene, setCurrentScene] = useState("");
  const [streamStatus, setStreamStatus] = useState<ObsOutputStatus>({
    active: false,
    timecode: "",
  });
  const [recordStatus, setRecordStatus] = useState<ObsOutputStatus>({
    active: false,
    timecode: "",
  });
  const [audioInputs, setAudioInputs] = useState<ObsAudioInput[]>([]);
  const [transitions, setTransitions] = useState<string[]>([]);
  const [transitionName, setTransitionName] = useState("");
  const [transitionDuration, setTransitionDuration] = useState(300);
  const [studioModeEnabled, setStudioModeEnabled] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const refreshSceneSources = useCallback(async (client: OBSWebSocket, sceneName: string) => {
    if (!sceneName) {
      setSources([]);
      return;
    }
    const result = await client.call("GetSceneItemList", { sceneName });
    setSources(readObsSceneSources(result.sceneItems));
  }, []);

  const refreshStatus = useCallback(async (client: OBSWebSocket) => {
    const [sceneResult, streamResult, recordResult, kindResult, specialResult, transitionResult, currentTransition, studioMode] = await Promise.all([
      client.call("GetSceneList"),
      client.call("GetStreamStatus"),
      client.call("GetRecordStatus"),
      client.call("GetInputKindList", { unversioned: true }),
      client.call("GetSpecialInputs"),
      client.call("GetSceneTransitionList"),
      client.call("GetCurrentSceneTransition"),
      client.call("GetStudioModeEnabled"),
    ]);
    setScenes(readObsScenes(sceneResult.scenes));
    const sceneName = sceneResult.currentProgramSceneName ?? "";
    setCurrentScene(sceneName);
    setInputKinds(kindResult.inputKinds);
    setSelectedInputKind((current) =>
      current && kindResult.inputKinds.includes(current)
        ? current
        : kindResult.inputKinds[0] ?? "",
    );
    const names = [...new Set(
      Object.values(specialResult).filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      ),
    )];
    const audioResults = await Promise.all(
      names.map(async (name) => {
        const [muteResult, volumeResult] = await Promise.all([
          client.call("GetInputMute", { inputName: name }),
          client.call("GetInputVolume", { inputName: name }),
        ]);
        return {
          name,
          muted: muteResult.inputMuted,
          volume: Math.max(0, Math.min(2, volumeResult.inputVolumeMul)),
        };
      }),
    );
    setAudioInputs(audioResults);
    setTransitions(readObsNames(transitionResult.transitions, "transitionName"));
    setTransitionName(currentTransition.transitionName);
    setTransitionDuration(currentTransition.transitionDuration);
    setStudioModeEnabled(studioMode.studioModeEnabled);
    setStreamStatus({
      active: streamResult.outputActive,
      timecode: streamResult.outputTimecode,
    });
    setRecordStatus({
      active: recordResult.outputActive,
      timecode: recordResult.outputTimecode,
    });
    await refreshSceneSources(client, sceneName);
  }, [refreshSceneSources]);

  useEffect(
    () => () => {
      const client = clientRef.current;
      clientRef.current = null;
      if (client?.identified) {
        void client.disconnect();
      }
    },
    [],
  );

  const connect = async () => {
    let url: URL;
    try {
      url = new URL(server);
    } catch {
      setError("Enter a valid OBS WebSocket URL.");
      return;
    }
    if (!["ws:", "wss:"].includes(url.protocol)) {
      setError("OBS server URL must use ws:// or wss://.");
      return;
    }
    const isLoopback =
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
    if (url.protocol === "ws:" && !isLoopback) {
      setError("Use wss:// for remote OBS servers; unencrypted connections are allowed only on this computer.");
      return;
    }

    setConnecting(true);
    setError("");
    const client = new OBSWebSocket();
    try {
      await client.connect(url.toString(), password || undefined);
      clientRef.current = client;
      setConnected(true);
      setPassword("");
      localStorage.setItem("stagedesk.obs.server", url.toString());
      await refreshStatus(client);
      setStatusMessage("Connected to OBS Studio.");
      client.on("CurrentProgramSceneChanged", (event) => {
        setCurrentScene(event.sceneName);
        void refreshSceneSources(client, event.sceneName).catch((cause: unknown) => {
          setError(
            `Could not refresh OBS sources: ${cause instanceof Error ? cause.message : "Unknown error"}`,
          );
        });
      });
      client.on("StreamStateChanged", (event) => {
        setStreamStatus((current) => ({
          active: event.outputActive,
          timecode: event.outputActive ? current.timecode : "",
        }));
      });
      client.on("RecordStateChanged", (event) => {
        setRecordStatus((current) => ({
          active: event.outputActive,
          timecode: event.outputActive ? current.timecode : "",
        }));
      });
      client.on("ConnectionClosed", () => {
        if (clientRef.current === client) {
          clientRef.current = null;
          setConnected(false);
          setScenes([]);
          setSources([]);
          setStatusMessage("OBS disconnected.");
        }
      });
    } catch (cause) {
      await client.disconnect().catch(() => undefined);
      setError(
        `Could not connect to OBS: ${cause instanceof Error ? cause.message : "Connection failed."}`,
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const client = clientRef.current;
    clientRef.current = null;
    setConnected(false);
    setScenes([]);
    setSources([]);
    setCurrentScene("");
    setStreamStatus({ active: false, timecode: "" });
    setRecordStatus({ active: false, timecode: "" });
    if (client) {
      try {
        await client.disconnect();
        setStatusMessage("Disconnected from OBS.");
      } catch (cause) {
        setError(
          `Could not disconnect cleanly: ${cause instanceof Error ? cause.message : "Unknown error"}`,
        );
      }
    }
  };

  const runRequest = async (request: () => Promise<unknown>, success: string) => {
    const client = clientRef.current;
    if (!client) return false;
    setError("");
    setStatusMessage("");
    try {
      await request();
      await refreshStatus(client);
      setStatusMessage(success);
      return true;
    } catch (cause) {
      setError(
        `OBS command failed: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
      return false;
    }
  };

  const updateAudioVolume = (name: string, volume: number) => {
    void runRequest(
      () => clientRef.current!.call("SetInputVolume", { inputName: name, inputVolumeMul: volume }),
      `Updated ${name} volume.`,
    );
  };

  const updateAudioMute = (name: string, muted: boolean) => {
    void runRequest(
      () => clientRef.current!.call("SetInputMute", { inputName: name, inputMuted: muted }),
      `${name} ${muted ? "muted" : "unmuted"}.`,
    );
  };

  const setTransition = async (name: string) => {
    if (!name) return;
    const client = clientRef.current;
    if (!client) return;
    setError("");
    try {
      await client.call("SetCurrentSceneTransition", { transitionName: name });
      setTransitionName(name);
      setStatusMessage(`Transition set to ${name}.`);
    } catch (cause) {
      setError(`Could not set transition: ${cause instanceof Error ? cause.message : "Unknown error"}`);
    }
  };

  const createObsSource = () => {
    const client = clientRef.current;
    const inputName = newInputName.trim();
    if (!client || !currentScene || !selectedInputKind || !inputName) {
      setError("Choose a source type, enter a name, and select an OBS scene.");
      return;
    }
    void runRequest(
      () =>
        client.call("CreateInput", {
          sceneName: currentScene,
          inputName,
          inputKind: selectedInputKind,
        }),
      `Added ${inputName} to ${currentScene}. Configure device and source properties in OBS Studio.`,
    ).then((succeeded) => {
      if (succeeded) setNewInputName("");
    });
  };

  const setSourceVisible = (source: ObsSceneSource, enabled: boolean) => {
    void runRequest(
      () =>
        clientRef.current!.call("SetSceneItemEnabled", {
          sceneName: currentScene,
          sceneItemId: source.id,
          sceneItemEnabled: enabled,
        }),
      `${source.name} ${enabled ? "shown" : "hidden"}.`,
    );
  };

  const removeSource = (source: ObsSceneSource) => {
    if (!window.confirm(`Remove "${source.name}" from ${currentScene}?`)) return;
    void runRequest(
      () =>
        clientRef.current!.call("RemoveSceneItem", {
          sceneName: currentScene,
          sceneItemId: source.id,
        }),
      `Removed ${source.name} from ${currentScene}.`,
    );
  };

  const addPresentationSource = async () => {
    const client = clientRef.current;
    if (!client || !currentScene) {
      setError("Connect to OBS and select a program scene first.");
      return;
    }
    if (sources.some((source) => source.name === "StageDesk Slide Output")) {
      setError("StageDesk Slide Output is already in this OBS scene.");
      return;
    }
    try {
      const browserSourceUrl =
        await window.stageDesk?.getPresentationBrowserSourceUrl();
      if (!browserSourceUrl) {
        throw new Error("The desktop presentation server is not available.");
      }
      await runRequest(
        () =>
          client.call("CreateInput", {
            sceneName: currentScene,
            inputName: "StageDesk Slide Output",
            inputKind: "browser_source",
            inputSettings: {
              url: browserSourceUrl,
              width: 1920,
              height: 1080,
              fps: 30,
            },
          }),
        `Added the live StageDesk slide output to ${currentScene}.`,
      );
    } catch (cause) {
      setError(
        `Could not add the slide output: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
    }
  };

  if (mode === "hidden") return null;

  if (mode === "live") {
    return (
    <section className="obs-panel obs-live-panel">
      <div className="obs-intro">
        <div>
          <p className="eyebrow">CAMERA &amp; PRODUCTION</p>
          <h2>Live camera control</h2>
          <p>{connected ? `OBS · ${server}` : "Connect OBS Studio to switch production scenes and camera sources."}</p>
        </div>
        <span className={`connection-pill ${connected ? "connected" : ""}`}>
          <i /> {connected ? "CONNECTED" : "DISCONNECTED"}
        </span>
      </div>
      {!connected ? (
        <div className="connection-form live-connection-form">
          <label>
            <span>OBS WEBSOCKET ADDRESS</span>
            <input value={server} onChange={(event) => setServer(event.target.value)} />
          </label>
          <label>
            <span>OBS PASSWORD</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button primary" disabled={connecting} onClick={() => void connect()}>
            {connecting ? "Connecting…" : "Connect OBS"}
          </button>
        </div>
      ) : (
        <>
          <div className="live-obs-output-bar">
            <span>{streamStatus.active ? "● Streaming" : "Stream off"}</span>
            <span>{recordStatus.active ? "● Recording" : "Record off"}</span>
            <button className="button small quiet" onClick={() => void disconnect()}>Disconnect</button>
          </div>
          <div className="live-scene-select">
            <span>CAMERA / SCENE</span>
            {scenes.map((scene) => (
              <button
                className={`obs-scene ${scene.name === currentScene ? "selected" : ""}`}
                key={scene.uuid}
                onClick={() =>
                  void runRequest(
                    () => clientRef.current!.call("SetCurrentProgramScene", { sceneUuid: scene.uuid }),
                    `Switched to ${scene.name}.`,
                  )
                }
              >{scene.name}</button>
            ))}
          </div>
          <div className="live-source-controls">
            <span>CAMERA SOURCES · {currentScene || "NO SCENE"}</span>
            {sources.map((source) => (
              <div key={source.id} className="obs-source-row">
                <span className="obs-source-name"><i />{source.name}<small>{source.kind}</small></span>
                <button className={`button small ${source.enabled ? "primary" : "quiet"}`} onClick={() => setSourceVisible(source, !source.enabled)}>
                  {source.enabled ? "On" : "Off"}
                </button>
              </div>
            ))}
            {sources.length === 0 && <p className="empty-state">No camera sources in this scene.</p>}
          </div>
        </>
      )}
      <CameraController />
      {error && <div className="notice inline-notice" role="alert">{error}</div>}
      {statusMessage && <p className="obs-status" role="status">{statusMessage}</p>}
    </section>
    );
  }

  return (
    <section className="obs-panel">
      <div className="obs-intro">
        <div>
          <p className="eyebrow">OBS STUDIO ENGINE</p>
          <h2>Scenes, streaming &amp; recording</h2>
          <p>
            Control the full OBS production engine: scene collections, video and
            audio sources, filters, transitions, streaming destinations, recording,
            replay buffer, and plugins.
          </p>
        </div>
        <span className={`connection-pill ${connected ? "connected" : ""}`}>
          <i /> {connected ? "CONNECTED" : "DISCONNECTED"}
        </span>
      </div>

      {!connected && (
        <div className="obs-setup">
          <h3>Connect to OBS Studio</h3>
          <p>
            Install OBS Studio, then enable <strong>Tools → WebSocket Server
            Settings</strong>. OBS Studio 28 or newer includes the WebSocket server.
          </p>
          <div className="connection-form">
            <label>
              <span>SERVER ADDRESS</span>
              <input
                value={server}
                onChange={(event) => setServer(event.target.value)}
                placeholder="ws://127.0.0.1:4455"
                autoComplete="url"
              />
            </label>
            <label>
              <span>SERVER PASSWORD</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Optional for trusted local server"
                autoComplete="new-password"
              />
            </label>
            <button
              className="button primary"
              disabled={connecting}
              onClick={() => void connect()}
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>
          <p className="security-note">
            Passwords are used only for this connection and are not saved. Prefer
            localhost or a trusted network; use wss:// for remote connections.
          </p>
        </div>
      )}

      {connected && (
        <>
          <div className="obs-toolbar">
            <div><span className="status-dot green" /> Connected to <code>{server}</code></div>
            <button className="button quiet" onClick={() => void disconnect()}>Disconnect</button>
          </div>
          <div className="obs-output-grid">
            <article className="obs-output">
              <div>
                <p className="eyebrow">STREAM</p>
                <strong>{streamStatus.active ? "Streaming live" : "Not streaming"}</strong>
                {streamStatus.active && <small>{streamStatus.timecode}</small>}
              </div>
              <button
                className={`button ${streamStatus.active ? "danger" : "primary"}`}
                onClick={() =>
                  void runRequest(
                    () =>
                      clientRef.current!.call(
                        streamStatus.active ? "StopStream" : "StartStream",
                      ),
                    streamStatus.active ? "Stream stopped." : "Stream started.",
                  )
                }
              >
                {streamStatus.active ? "Stop stream" : "Start stream"}
              </button>
            </article>
            <article className="obs-output">
              <div>
                <p className="eyebrow">RECORDING</p>
                <strong>{recordStatus.active ? "Recording" : "Not recording"}</strong>
                {recordStatus.active && <small>{recordStatus.timecode}</small>}
              </div>
              <button
                className={`button ${recordStatus.active ? "danger" : "primary"}`}
                onClick={() =>
                  void runRequest(
                    () =>
                      clientRef.current!.call(
                        recordStatus.active ? "StopRecord" : "StartRecord",
                      ),
                    recordStatus.active ? "Recording stopped." : "Recording started.",
                  )
                }
              >
                {recordStatus.active ? "Stop recording" : "Start recording"}
              </button>
            </article>
          </div>
          <div className="obs-scenes">
            <div className="strip-header">
              <strong>OBS PROGRAM SCENE</strong>
              <span>On air: {currentScene || "Unknown"}</span>
            </div>
            <div className="obs-scene-list">
              {scenes.map((scene) => (
                <button
                  key={scene.uuid}
                  className={`obs-scene ${scene.name === currentScene ? "selected" : ""}`}
                  onClick={() =>
                    void runRequest(
                      () =>
                        clientRef.current!.call("SetCurrentProgramScene", {
                          sceneUuid: scene.uuid,
                        }),
                      `Switched to ${scene.name}.`,
                    )
                  }
                >
                  <span>▧</span>{scene.name}
                </button>
              ))}
              {scenes.length === 0 && <p className="empty-state">No scenes are available in the OBS scene collection.</p>}
            </div>
          </div>
          <div className="obs-transition-panel">
            <div>
              <p className="eyebrow">STUDIO / TRANSITIONS</p>
              <div className="transition-controls">
                <button className={`button small ${studioModeEnabled ? "primary" : "quiet"}`} onClick={() => void runRequest(
                  () => clientRef.current!.call("SetStudioModeEnabled", { studioModeEnabled: !studioModeEnabled }),
                  studioModeEnabled ? "Studio mode disabled." : "Studio mode enabled.",
                )}>Studio mode {studioModeEnabled ? "On" : "Off"}</button>
                <select value={transitionName} onChange={(event) => void setTransition(event.target.value)}>
                  {transitions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <label>Duration
                  <input
                    type="number"
                    min={50}
                    max={20000}
                    step={50}
                    value={transitionDuration}
                    onChange={(event) => setTransitionDuration(Math.min(20000, Math.max(50, Number(event.target.value) || 50)))}
                    onBlur={() => void runRequest(
                      () => clientRef.current!.call("SetCurrentSceneTransitionDuration", { transitionDuration }),
                      "Transition duration updated.",
                    )}
                  />
                  <span>ms</span>
                </label>
              </div>
            </div>
          </div>
          <div className="obs-source-panel">
            <div className="strip-header">
              <strong>SOURCES · {currentScene || "NO PROGRAM SCENE"}</strong>
              <span>{sources.length} source{sources.length === 1 ? "" : "s"}</span>
            </div>
            <div className="presentation-source">
              <div>
                <strong>Live presentation slides</strong>
                <span>Add the current StageDesk slide output to the OBS program scene.</span>
              </div>
              <button className="button small" onClick={() => void addPresentationSource()}>
                Add slide output
              </button>
            </div>
            <div className="obs-source-add">
              <label>
                <span>OBS SOURCE TYPE</span>
                <select
                  value={selectedInputKind}
                  onChange={(event) => setSelectedInputKind(event.target.value)}
                >
                  {inputKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label>
                <span>SOURCE NAME</span>
                <input
                  value={newInputName}
                  onChange={(event) => setNewInputName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createObsSource();
                  }}
                  placeholder="e.g. Main camera"
                />
              </label>
              <button className="button small primary" onClick={createObsSource}>＋ Add source</button>
            </div>
            <div className="obs-source-list">
              {sources.map((source) => (
                <div className="obs-source-row" key={source.id}>
                  <span className="obs-source-name"><i />{source.name}<small>{source.kind}</small></span>
                  <button
                    className="button small quiet"
                    onClick={() => setSourceVisible(source, !source.enabled)}
                  >{source.enabled ? "Hide" : "Show"}</button>
                  <button
                    className="button small quiet remove-source"
                    onClick={() => removeSource(source)}
                    aria-label={`Remove ${source.name} from scene`}
                  >Remove</button>
                </div>
              ))}
              {sources.length === 0 && <p className="empty-state">This OBS scene has no sources yet.</p>}
            </div>
            <p className="obs-source-note">
              OBS supplies source types and media processing. Add hardware inputs here;
              configure device settings and filters in OBS Studio.
            </p>
          </div>
          <div className="obs-audio-panel">
            <div className="strip-header"><strong>AUDIO MIXER · OBS INPUTS</strong><span>{audioInputs.length} channels</span></div>
            {audioInputs.map((input) => (
              <div className="audio-channel" key={input.name}>
                <strong>{input.name}</strong>
                <button className={`button small ${input.muted ? "danger" : "quiet"}`} onClick={() => updateAudioMute(input.name, !input.muted)}>
                  {input.muted ? "Muted" : "Mute"}
                </button>
                <input
                  aria-label={`${input.name} volume`}
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={input.volume}
                  onChange={(event) => {
                    const volume = Number(event.target.value);
                    setAudioInputs((current) => current.map((item) => item.name === input.name ? { ...item, volume } : item));
                  }}
                  onMouseUp={(event) => updateAudioVolume(input.name, Number(event.currentTarget.value))}
                  onTouchEnd={(event) => updateAudioVolume(input.name, Number(event.currentTarget.value))}
                  onKeyUp={(event) => updateAudioVolume(input.name, Number(event.currentTarget.value))}
                />
                <span>{Math.round(input.volume * 100)}%</span>
              </div>
            ))}
            {audioInputs.length === 0 && <p className="empty-state">OBS has no configured microphone or desktop audio input.</p>}
          </div>
        </>
      )}
      {error && <div className="notice inline-notice" role="alert">{error}</div>}
      {statusMessage && <p className="obs-status" role="status">{statusMessage}</p>}
    </section>
  );
}

function AudienceDisplay() {
  const [stage, setStage] = useState<StageState | null>(null);

  useEffect(() => window.stageDesk?.onStageUpdate(setStage), []);

  return (
    <main
      className="audience-screen"
      style={{
        background:
          stage?.slide?.background ?? stage?.sceneColor ?? "#080b0f",
      }}
    >
      {stage?.slide ? (
        <section className="audience-content" aria-live="polite">
          <p className="audience-kicker">{stage.projectName}</p>
          <h1
            style={{
              color: stage.slide.textColor ?? "#ffffff",
              fontSize: stage.slide.fontSize
                ? `clamp(34px, ${stage.slide.fontSize / 14}vw, ${stage.slide.fontSize}px)`
                : undefined,
              textAlign: stage.slide.textAlign ?? "center",
            }}
          >{stage.slide.title || " "}</h1>
          <p
            className="audience-body"
            style={{
              color: stage.slide.textColor ?? "#ffffff",
              fontSize: stage.slide.fontSize
                ? `clamp(22px, ${stage.slide.fontSize / 14}vw, ${stage.slide.fontSize}px)`
                : undefined,
              textAlign: stage.slide.textAlign ?? "center",
            }}
          >{stage.slide.body || " "}</p>
        </section>
      ) : (
        <section className="audience-content audience-idle">
          <p>StageDesk audience display</p>
          <span>Put a slide live to begin.</span>
        </section>
      )}
    </main>
  );
}

function makeId() {
  return crypto.randomUUID();
}

function OperatorWorkspace() {
  const [project, setProject] = useState<Project>(initialProject);
  const [page, setPage] = useState<WorkspacePage>("presentation");
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [selectedSlideId, setSelectedSlideId] = useState(
    initialProject.liveSlideId ?? initialProject.slides[0]?.id ?? "",
  );
  const [notice, setNotice] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [savedProjectJson, setSavedProjectJson] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [projectionDisplays, setProjectionDisplays] = useState<ProjectionDisplay[]>([]);
  const serializedProject = JSON.stringify(project);
  const isDirty = serializedProject !== savedProjectJson;

  const currentScene = useMemo(
    () =>
      project.scenes.find((scene) => scene.id === project.currentSceneId) ??
      project.scenes[0],
    [project.currentSceneId, project.scenes],
  );
  const liveSlide = useMemo(
    () => project.slides.find((slide) => slide.id === project.liveSlideId) ?? null,
    [project.liveSlideId, project.slides],
  );
  const selectedSlide = useMemo(
    () => project.slides.find((slide) => slide.id === selectedSlideId) ?? null,
    [project.slides, selectedSlideId],
  );
  const filteredSlides = useMemo(
    () =>
      contentFilter === "all"
        ? project.slides
        : project.slides.filter(
            (slide) => (slide.kind ?? "slide") === contentFilter,
          ),
    [contentFilter, project.slides],
  );
  const liveIndex = project.slides.findIndex(
    (slide) => slide.id === project.liveSlideId,
  );

  const stageState: StageState = useMemo(
    () => ({
      projectName: project.name,
      sceneName: currentScene?.name ?? "No scene",
      sceneColor: currentScene?.color ?? "#080b0f",
      slide: liveSlide,
      slideNumber: liveIndex < 0 ? 0 : liveIndex + 1,
      slideCount: project.slides.length,
    }),
    [currentScene, liveIndex, liveSlide, project.name, project.slides.length],
  );

  useEffect(() => {
    let active = true;
    window.stageDesk?.listDisplays().then((displays) => {
      if (active) setProjectionDisplays(displays);
    }).catch((cause: unknown) => {
      if (active) {
        setNotice(
          `Could not list projection displays: ${cause instanceof Error ? cause.message : "Unknown error"}`,
        );
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.stageDesk?.publishStage(stageState).catch((cause: unknown) => {
      setNotice(
        `Could not update presentation output: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
    });
  }, [stageState]);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (isDirty && !window.confirm("Discard unsaved changes to this project?")) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [isDirty]);

  const setLiveSlideByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= project.slides.length) return;
      setProject((current) => ({
        ...current,
        liveSlideId: current.slides[index].id,
      }));
    },
    [project.slides.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      ) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setLiveSlideByIndex(liveIndex + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setLiveSlideByIndex(liveIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [liveIndex, setLiveSlideByIndex]);

  const updateSlide = (id: string, changes: Partial<Slide>) => {
    setProject((current) => ({
      ...current,
      slides: current.slides.map((slide) =>
        slide.id === id ? { ...slide, ...changes } : slide,
      ),
    }));
  };

  const addSlide = () => {
    const slide: Slide = {
      id: makeId(),
      title: "New slide",
      body: "Add your text here.",
      background: "#293a50",
      kind: "slide",
    };
    setProject((current) => ({
      ...current,
      slides: [...current.slides, slide],
    }));
    setSelectedSlideId(slide.id);
    setContentFilter("all");
    setPage("presentation");
  };

  const addSong = () => {
    const songId = makeId();
    const background = "#273a51";
    const titleSlide: Slide = {
      id: makeId(),
      kind: "song",
      section: "Title",
      title: "New song",
      body: "Add the song title or artist.",
      background,
    };
    const verse: Slide = {
      id: makeId(),
      kind: "song",
      section: `Verse 1 · ${songId}`,
      title: "New song",
      body: "Enter the first verse, one lyric line per row.",
      background,
    };
    const chorus: Slide = {
      id: makeId(),
      kind: "song",
      section: `Chorus · ${songId}`,
      title: "New song",
      body: "Enter the chorus, one lyric line per row.",
      background,
    };
    setProject((current) => ({
      ...current,
      slides: [...current.slides, titleSlide, verse, chorus],
    }));
    setSelectedSlideId(titleSlide.id);
    setContentFilter("song");
    setPage("presentation");
  };

  const addScripture = () => {
    const scripture: Slide = {
      id: makeId(),
      kind: "scripture",
      section: "Scripture",
      title: "Scripture reference",
      body: "Type or paste the passage text here.",
      background: "#293a50",
    };
    setProject((current) => ({
      ...current,
      slides: [...current.slides, scripture],
    }));
    setSelectedSlideId(scripture.id);
    setContentFilter("scripture");
    setPage("presentation");
  };

  const duplicateSlide = (slide: Slide) => {
    const copy = { ...slide, id: makeId(), section: slide.section ? `${slide.section} copy` : undefined };
    setProject((current) => {
      const index = current.slides.findIndex((item) => item.id === slide.id);
      return {
        ...current,
        slides: [
          ...current.slides.slice(0, index + 1),
          copy,
          ...current.slides.slice(index + 1),
        ],
      };
    });
    setSelectedSlideId(copy.id);
  };

  const deleteSlide = (id: string) => {
    const slide = project.slides.find((item) => item.id === id);
    if (!slide || !window.confirm(`Delete "${slide.title || "Untitled"}"?`)) return;
    const remaining = project.slides.filter((item) => item.id !== id);
    setProject((current) => ({
      ...current,
      slides: current.slides.filter((item) => item.id !== id),
      liveSlideId: current.liveSlideId === id
        ? remaining[0]?.id ?? null
        : current.liveSlideId,
    }));
    if (selectedSlideId === id) {
      setSelectedSlideId(remaining[0]?.id ?? "");
    }
  };

  const moveSlide = (id: string, offset: -1 | 1) => {
    setProject((current) => {
      const index = current.slides.findIndex((slide) => slide.id === id);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= current.slides.length) {
        return current;
      }
      const slides = [...current.slides];
      [slides[index], slides[destination]] = [slides[destination], slides[index]];
      return { ...current, slides };
    });
  };

  const importPresentation = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importSlides(file);
      setProject((current) => ({
        ...current,
        slides: [...current.slides, ...imported],
      }));
      setSelectedSlideId(imported[0].id);
      setNotice(`Imported ${imported.length} slide${imported.length === 1 ? "" : "s"}.`);
      setContentFilter("all");
      setPage("presentation");
    } catch (cause) {
      setNotice(
        `Could not import presentation: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const addScene = () => {
    const scene: Scene = {
      id: makeId(),
      name: `Scene ${project.scenes.length + 1}`,
      color: "#344457",
      description: "New scene",
    };
    setProject((current) => ({
      ...current,
      scenes: [...current.scenes, scene],
      currentSceneId: scene.id,
    }));
  };

  const saveProject = async () => {
    if (!window.stageDesk) {
      setNotice("Project file dialogs are available in the desktop app.");
      return;
    }
    try {
      const result = await window.stageDesk.saveProject(project);
      if (result.canceled) return;
      setSavedProjectJson(serializedProject);
      setSavedPath(result.filePath);
      setNotice("Project saved.");
    } catch (error) {
      setNotice(
        `Could not save project: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const openProject = async () => {
    if (!window.stageDesk) {
      setNotice("Project file dialogs are available in the desktop app.");
      return;
    }
    if (isDirty && !window.confirm("Discard unsaved changes and open another project?")) {
      return;
    }
    try {
      const result = await window.stageDesk.openProject();
      if (result.canceled) return;
      setProject(result.project);
      setSavedProjectJson(JSON.stringify(result.project));
      setSavedPath("");
      setNotice("Project opened.");
    } catch (error) {
      setNotice(
        `Could not open project: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const openAudience = async () => {
    if (!window.stageDesk) {
      setNotice("The audience display is available in the desktop app.");
      return;
    }
    try {
      await window.stageDesk.openAudienceDisplay();
    } catch (error) {
      setNotice(
        `Could not open audience display: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const openAudienceOn = async (displayId: number) => {
    try {
      await window.stageDesk?.openAudienceDisplayOn(displayId);
      setNotice("Projector output opened.");
    } catch (cause) {
      setNotice(
        `Could not open projector: ${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
    }
  };

  const setCurrentScene = (id: string) => {
    setProject((current) => ({ ...current, currentSceneId: id }));
  };

  const selectedScene = project.scenes.find(
    (scene) => scene.id === project.currentSceneId,
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>STAGEDESK</span>
        </div>
        <div className="project-title">
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(event) =>
              setProject((current) => ({ ...current, name: event.target.value }))
            }
          />
          <span className={`save-state ${isDirty ? "unsaved" : "saved"}`}>
            {isDirty ? "Unsaved changes" : "Saved"}
          </span>
          {savedPath && <span className="saved-path">{savedPath}</span>}
        </div>
        <div className="top-actions">
          <button className="button quiet" onClick={openProject}>
            Open
          </button>
          <button className="button primary" onClick={saveProject}>
            Save project
          </button>
          <span className="operator-pill"><i /> Operator ready</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">WORKSPACES</div>
          <button
            className={`nav-item ${page === "presentation" ? "selected" : ""}`}
            onClick={() => setPage("presentation")}
          >
            <span className="nav-icon">▤</span> Presentations &amp; songs
            <span className="nav-count">{project.slides.length}</span>
          </button>
          <button
            className={`nav-item ${page === "obs" ? "selected" : ""}`}
            onClick={() => setPage("obs")}
          >
            <span className="nav-icon">▦</span> OBS Studio
          </button>
          <button
            className={`nav-item ${page === "live" ? "selected" : ""}`}
            onClick={() => setPage("live")}
          >
            <span className="nav-icon">◉</span> Live control
          </button>

          <div className="sidebar-divider" />
          <div className="sidebar-label section-label">LIVE STATUS</div>
          <div className="status-card">
            <span className="status-dot amber" />
            <div><strong>Project</strong><small>{project.name}</small></div>
          </div>
          <div className="status-card muted-card">
            <span className="status-dot gray" />
            <div><strong>Slide cue</strong><small>{liveSlide?.title || "Black / no slide"}</small></div>
          </div>
          <div className="sidebar-spacer" />
          <div className="shortcut-card">
            <span>LIVE CONTROL</span>
            <p><kbd>←</kbd><kbd>→</kbd><em>Previous / next slide</em></p>
            <p><kbd>PgUp</kbd><kbd>PgDn</kbd><em>Previous / next slide</em></p>
          </div>
        </aside>

        <main className="main-area">
          <div className="main-heading">
            <div>
              <p className="eyebrow">{page === "presentation" ? "EDITORIAL & SHOW LIBRARY" : page === "obs" ? "VIDEO PRODUCTION" : "CAMERA · CUES · PROJECTION"}</p>
              <h1>{page === "presentation" ? "Presentation & editorial" : page === "obs" ? "OBS Studio production" : "Live operator control"}</h1>
            </div>
            <button className="button quiet display-button" onClick={openAudience}>
              <span className="button-icon">▣</span> Open audience display
            </button>
          </div>

          <div className={`obs-portal ${page === "presentation" ? "workspace-hidden" : ""}`}>
            <ObsStudioPanel mode={page === "live" ? "live" : "obs"} />
          </div>

          {page === "obs" ? (
            null
          ) : page === "live" ? (
            <div className="live-workspace">
              <section className="live-preview-column">
                <div className="monitor-heading">
                  <span><i className="monitor-dot" /> ON AIR OUTPUT</span>
                  <span className="monitor-scene">{currentScene?.name ?? "No scene"}</span>
                </div>
                <div
                  className="preview-canvas live-canvas"
                  style={{ backgroundColor: liveSlide?.background ?? currentScene?.color }}
                >
                  {liveSlide ? (
                    <div className="canvas-content" style={{ color: liveSlide.textColor ?? "#fff", textAlign: liveSlide.textAlign ?? "center" }}>
                      <h2 style={{ fontSize: liveSlide.fontSize ? `clamp(18px, ${liveSlide.fontSize / 14}vw, ${liveSlide.fontSize}px)` : undefined }}>{liveSlide.title}</h2>
                      <p>{liveSlide.body}</p>
                    </div>
                  ) : <div className="canvas-empty">BLACK · no slide on air</div>}
                  <div className="slide-counter">{liveIndex >= 0 ? `${liveIndex + 1} / ${project.slides.length}` : "BLACK"}</div>
                </div>
                <div className="preview-controls">
                  <button className="button quiet" disabled={liveIndex <= 0} onClick={() => setLiveSlideByIndex(liveIndex - 1)}>← Previous</button>
                  <button className="button danger" onClick={() => setProject((current) => ({ ...current, liveSlideId: null }))}>Blackout</button>
                  <span className="live-indicator"><i /> LIVE CONTROL</span>
                  <button className="button primary" disabled={liveIndex >= project.slides.length - 1} onClick={() => setLiveSlideByIndex(liveIndex < 0 ? 0 : liveIndex + 1)}>Next →</button>
                </div>
                <article className="live-stage-output">
                  <div>
                    <p className="eyebrow">PROJECTION SCREENS</p>
                    <strong>Audience displays</strong>
                    <span>The same on-air cue is sent to each opened projection display and the OBS browser source.</span>
                  </div>
                  <div className="projection-buttons">
                    {projectionDisplays.map((display) => (
                      <button className="button primary" key={display.id} onClick={() => void openAudienceOn(display.id)}>
                        {display.label}
                      </button>
                    ))}
                    {projectionDisplays.length === 0 && <button className="button primary" onClick={openAudience}>Open projector</button>}
                  </div>
                </article>
                <div className="source-strip">
                  <div className="strip-header"><strong>ON-AIR SCENES</strong></div>
                  <div className="scene-list">
                    {project.scenes.map((scene) => (
                      <button className={`scene-tile ${scene.id === project.currentSceneId ? "active" : ""}`} key={scene.id} onClick={() => setCurrentScene(scene.id)}>
                        <span className="scene-thumb" style={{ background: scene.color }}>▧</span>
                        <span>{scene.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <aside className="live-controls-column">
                <section className="content-column live-rundown">
                  <div className="panel-title"><div><p className="eyebrow">CUE LIST</p><h2>Live slides</h2></div><span>{project.slides.length} cues</span></div>
                  <div className="live-slide-list">
                    {project.slides.map((slide, index) => (
                      <button key={slide.id} className={`live-slide-cue ${slide.id === project.liveSlideId ? "on-air" : ""}`} onClick={() => setLiveSlideByIndex(index)}>
                        <b>{String(index + 1).padStart(2, "0")}</b><span>{slide.title || "Untitled"}<small>{slide.section || (slide.kind === "song" ? "Song lyric" : slide.kind === "scripture" ? "Scripture" : "Slide")}</small></span>{slide.id === project.liveSlideId && <i>LIVE</i>}
                      </button>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          ) : (
            <div className="production-grid">
              <section className="preview-column">
                <div className="monitor-heading">
                  <span><i className="monitor-dot" /> PREVIEW</span>
                  <span className="monitor-scene">{currentScene?.name ?? "No scene"}</span>
                </div>
                <div
                  className="preview-canvas"
                  style={{ backgroundColor: liveSlide?.background ?? currentScene?.color }}
                >
                  <div className="canvas-overlay">LOCAL PREVIEW · {currentScene?.name ?? "No scene"}</div>
                  {liveSlide ? (
                    <div className="canvas-content" style={{ color: liveSlide.textColor ?? "#fff", textAlign: liveSlide.textAlign ?? "center" }}>
                      <h2 style={{ fontSize: liveSlide.fontSize ? `clamp(18px, ${liveSlide.fontSize / 14}vw, ${liveSlide.fontSize}px)` : undefined }}>{liveSlide.title || " "}</h2>
                      <p style={{ fontSize: liveSlide.fontSize ? `clamp(12px, ${liveSlide.fontSize / 20}vw, ${liveSlide.fontSize / 2}px)` : undefined }}>{liveSlide.body || " "}</p>
                    </div>
                  ) : (
                    <div className="canvas-empty">Select a slide to put it live</div>
                  )}
                  {liveSlide && <div className="slide-counter">{liveIndex + 1} / {project.slides.length}</div>}
                </div>
                <div className="preview-controls">
                  <button
                    className="button quiet"
                    aria-label="Previous slide"
                    disabled={liveIndex <= 0}
                    onClick={() => setLiveSlideByIndex(liveIndex - 1)}
                  >← Previous</button>
                  <span className="live-indicator"><i /> ON DISPLAY</span>
                  <button
                    className="button quiet"
                    aria-label="Next slide"
                    disabled={liveIndex < 0 || liveIndex >= project.slides.length - 1}
                    onClick={() => setLiveSlideByIndex(liveIndex + 1)}
                  >Next →</button>
                </div>

                <div className="source-strip">
                  <div className="strip-header"><strong>SCENES</strong><button onClick={addScene}>＋ Add scene</button></div>
                  <div className="scene-list">
                    {project.scenes.map((scene) => (
                      <button
                        className={`scene-tile ${scene.id === project.currentSceneId ? "active" : ""}`}
                        key={scene.id}
                        onClick={() => setCurrentScene(scene.id)}
                      >
                        <span className="scene-thumb" style={{ background: scene.color }}>▧</span>
                        <span>{scene.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="content-column">
                <div className="panel-title">
                  <div><p className="eyebrow">SHOW LIBRARY</p><h2>Editorial</h2></div>
                  <div className="slide-actions">
                    <input ref={importInputRef} className="visually-hidden" type="file" accept=".pptx,.txt,.md" onChange={(event) => void importPresentation(event.target.files?.[0])} />
                    <button className="button small quiet" onClick={() => importInputRef.current?.click()}>Import</button>
                    <button className="button small primary" onClick={addSlide}>＋ Slide</button>
                  </div>
                </div>
                <div className="editor-create-row">
                  <button className="button small" onClick={addSong}>＋ Song</button>
                  <button className="button small" onClick={addScripture}>＋ Scripture</button>
                </div>
                <div className="content-filter">
                  {(["all", "slide", "song", "scripture"] as const).map((filter) => (
                    <button className={contentFilter === filter ? "active" : ""} key={filter} onClick={() => setContentFilter(filter)}>
                      {filter === "all" ? "All content" : filter === "slide" ? "Slides" : filter === "song" ? "Songs" : "Scripture"}
                      <span>{filter === "all" ? project.slides.length : project.slides.filter((slide) => (slide.kind ?? "slide") === filter).length}</span>
                    </button>
                  ))}
                </div>
                <div className="slide-list editorial-list">
                  {filteredSlides.map((slide) => {
                    const index = project.slides.findIndex((item) => item.id === slide.id);
                    return (
                      <div className={`slide-card ${slide.id === selectedSlideId ? "selected-editorial" : ""} ${slide.id === project.liveSlideId ? "on-air" : ""}`} key={slide.id}>
                        <button className="slide-select" onClick={() => setSelectedSlideId(slide.id)}>
                          <span className="slide-thumb" style={{ background: slide.background }}><strong>{slide.title || "Untitled"}</strong><small>{slide.body.split("\n")[0]}</small></span>
                          <span className="slide-meta"><b>{String(index + 1).padStart(2, "0")}</b><span>{slide.title || "Untitled"}<small>{slide.section || slide.kind || "Slide"}</small></span></span>
                        </button>
                        <div className="editorial-actions">
                          <button title="Put this cue live" aria-label={`Put ${slide.title} live`} onClick={() => setProject((current) => ({ ...current, liveSlideId: slide.id }))}>{slide.id === project.liveSlideId ? "ON AIR" : "LIVE"}</button>
                          <button title="Move earlier" aria-label="Move earlier" disabled={index === 0} onClick={() => moveSlide(slide.id, -1)}>↑</button>
                          <button title="Move later" aria-label="Move later" disabled={index === project.slides.length - 1} onClick={() => moveSlide(slide.id, 1)}>↓</button>
                          <button title="Duplicate cue" aria-label="Duplicate cue" onClick={() => duplicateSlide(slide)}>⧉</button>
                          <button title="Delete cue" aria-label="Delete cue" onClick={() => deleteSlide(slide.id)}>×</button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredSlides.length === 0 && <div className="empty-state">No content in this category. Create a slide, song or scripture item.</div>}
                </div>
                {selectedSlide && (
                  <div className="editor-card">
                    <div className="editor-title"><strong>Edit {selectedSlide.kind ?? "slide"}</strong><button className="button small quiet" onClick={() => setProject((current) => ({ ...current, liveSlideId: selectedSlide.id }))}>Put live</button></div>
                    <label><span>TITLE / REFERENCE</span><input value={selectedSlide.title} onChange={(event) => updateSlide(selectedSlide.id, { title: event.target.value })} /></label>
                    <label><span>SECTION / VERSE</span><input value={selectedSlide.section ?? ""} onChange={(event) => updateSlide(selectedSlide.id, { section: event.target.value })} placeholder="Verse 1, Chorus, John 3:16…" /></label>
                    <label><span>BODY / LYRICS / PASSAGE</span><textarea rows={3} value={selectedSlide.body} onChange={(event) => updateSlide(selectedSlide.id, { body: event.target.value })} /></label>
                    <div className="editor-style-row">
                      <label className="color-editor"><span>BACKGROUND</span><input type="color" value={selectedSlide.background} onChange={(event) => updateSlide(selectedSlide.id, { background: event.target.value })} /></label>
                      <label className="color-editor"><span>TEXT</span><input type="color" value={selectedSlide.textColor ?? "#ffffff"} onChange={(event) => updateSlide(selectedSlide.id, { textColor: event.target.value })} /></label>
                      <label><span>ALIGN</span><select value={selectedSlide.textAlign ?? "center"} onChange={(event) => updateSlide(selectedSlide.id, { textAlign: event.target.value as Slide["textAlign"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      <label><span>FONT SIZE</span><input type="number" min={12} max={120} value={selectedSlide.fontSize ?? 48} onChange={(event) => updateSlide(selectedSlide.id, { fontSize: Math.min(120, Math.max(12, Number(event.target.value) || 12)) })} /></label>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
          {notice && <div role="status" className="notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
        </main>
      </div>
      <footer className="statusbar">
        <span><i className="status-dot green" /> Project ready</span>
        <span>{selectedScene?.name ?? "No scene selected"}</span>
        <span className="statusbar-right">StageDesk · Live presentation workspace</span>
      </footer>
    </div>
  );
}

function App() {
  return new URLSearchParams(window.location.search).has("stage") ? (
    <AudienceDisplay />
  ) : (
    <OperatorWorkspace />
  );
}

export default App;
