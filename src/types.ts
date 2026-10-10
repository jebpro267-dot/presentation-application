export type Scene = {
  id: string;
  name: string;
  color: string;
  description: string;
};

export type Slide = {
  id: string;
  title: string;
  body: string;
  background: string;
  kind?: "slide" | "song" | "scripture";
  section?: string;
  textColor?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
};

export type Project = {
  version: 1;
  name: string;
  scenes: Scene[];
  slides: Slide[];
  currentSceneId: string;
  liveSlideId: string | null;
};

export type StageState = {
  projectName: string;
  sceneName: string;
  sceneColor: string;
  slide: Slide | null;
  slideNumber: number;
  slideCount: number;
};

export type ProjectionDisplay = {
  id: number;
  label: string;
  isPrimary: boolean;
};

declare global {
  interface Window {
    stageDesk?: {
      saveProject: (
        project: Project,
      ) => Promise<{ canceled: true } | { canceled: false; filePath: string }>;
      openProject: () => Promise<
        { canceled: true } | { canceled: false; project: Project }
      >;
      openAudienceDisplay: () => Promise<void>;
      listDisplays: () => Promise<ProjectionDisplay[]>;
      openAudienceDisplayOn: (displayId: number) => Promise<void>;
      publishStage: (state: StageState) => Promise<void>;
      getPresentationBrowserSourceUrl: () => Promise<string>;
      onStageUpdate: (callback: (state: StageState) => void) => () => void;
    };
  }
}
