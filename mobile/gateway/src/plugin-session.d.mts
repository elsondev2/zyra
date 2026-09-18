export class MobilePluginSession {
  readonly supportsMachineScope: true;
  constructor(api: {
    context(canonicalChatId: string): Promise<{sessionId: string; projectId: string | null} | null>;
    catalog(): Promise<any>;
    subscribe?(listener: () => void): () => void;
    defaults(input: {projectId: string | null; pluginIds: string[]; expectedRevision: number}): Promise<unknown>;
    refresh(input: {sessionId: string; expectedCatalogRevision: number}): Promise<unknown>;
    state?(input: {pluginId: string; state: 'active' | 'disabled'; expectedCatalogRevision: number}): Promise<unknown>;
    rollback?(input: {pluginId: string; releaseId: string; expectedCatalogRevision: number}): Promise<unknown>;
    downloads?: {
      directory(): Promise<any>;
      installed?(): Promise<Array<{name: string; sourceId: string; state: string; version: string}>>;
      start(name: string): Promise<any>;
      status(id: string): Promise<any>;
      cancelAll(): Promise<unknown>;
      install(reviewId: string): Promise<unknown>;
    };
  }, changed?: () => void);
  dispatch(method: string, params: any, chat: any, manageMachine: boolean): Promise<any>;
  close(): void;
}
