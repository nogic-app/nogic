export interface ChatModes {
  think: boolean;
  deep_think: boolean;
  web: boolean;
}

export const DEFAULT_CHAT_MODES: ChatModes = {
  think: false,
  deep_think: false,
  web: false,
};
