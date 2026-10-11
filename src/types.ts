export type ConnectorProps = {
  userId: string;
  displayName?: string;
  username?: string;
};

export type StoredMicrosoftTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  scope: string;
};

export type MicrosoftIdentity = {
  userId: string;
  displayName?: string;
  username?: string;
};

export type GraphDateTimeTimeZone = {
  dateTime: string;
  timeZone: string;
};

export type GraphTodoTaskList = {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: string;
  "@odata.etag"?: string;
};

export type GraphTodoTask = {
  id: string;
  title: string;
  status?: string;
  importance?: string;
  isReminderOn?: boolean;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  bodyLastModifiedDateTime?: string;
  body?: { content?: string; contentType?: string };
  categories?: string[];
  dueDateTime?: GraphDateTimeTimeZone | null;
  startDateTime?: GraphDateTimeTimeZone | null;
  reminderDateTime?: GraphDateTimeTimeZone | null;
  completedDateTime?: GraphDateTimeTimeZone | null;
  recurrence?: unknown;
  "@odata.etag"?: string;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ToolOperation = {
  name: string;
  input: Record<string, unknown>;
};

export type RunToolOperation = (operation: ToolOperation) => Promise<ToolResult>;
