import { DisplayMode } from '@microsoft/sp-core-library';
import SpfxChessWebPart from '../src/webparts/spfx-chess/spfx-chessWebPart';

const root = document.getElementById('root');
if (root) {
  const webPart = new SpfxChessWebPart();
  (webPart as unknown as {
    _internalInitialize(
      context: { domElement: HTMLElement; manifest: { id: string; alias: string } },
      addedFromPersistedData: boolean,
      mode: DisplayMode
    ): void;
  })._internalInitialize(
    { domElement: root, manifest: { id: 'bc14b852-5256-4137-bc0a-ef0ee88908ef', alias: 'SpfxChessWebPart' } },
    false,
    DisplayMode.Read
  );
  (webPart as unknown as { _internalDeserialize(data: unknown): void })._internalDeserialize({
    properties: { description: 'spfx-chess' },
    dataVersion: '1.0'
  });
  webPart.render();
}