import { createComponent, type JSX } from 'solid-js';
import {
  PropertyPaneDropdown,
  PropertyPaneLabel,
  PropertyPaneTextField,
  PropertyPaneToggle,
  type IPropertyPaneConfiguration,
} from '@microsoft/sp-property-pane';
import {
  ThemeProvider,
  type IReadonlyTheme,
  type ThemeChangedEventArgs,
} from '@microsoft/sp-component-base';
import { SolidWebPart } from '@mbsks/rspfx-framework-solid/webpart';
import { ELO_LEVELS } from './engine/elo';
import SpfxChess, { type ISpfxChessProps } from './components/SpfxChess';

const CHROME_STYLE_ID = 'spfx-chess-chrome-style';

export type ISpfxChessWebPartProps = {
  eloKey: string;
  playerColor: 'w' | 'b' | 'random';
  playerName: string;
  listName: string;
  autosave: boolean;
  hidePageChrome: boolean;
};

export default class SpfxChessWebPart extends SolidWebPart<ISpfxChessWebPartProps, unknown> {
  private _themeProvider: ThemeProvider | undefined;
  private _themeVariant: IReadonlyTheme | undefined;
  private _chromeHiding = false;

  protected onInit(): Promise<void> {
    this._themeProvider = this.context.serviceScope.consume(ThemeProvider.serviceKey);
    this._themeVariant = this._themeProvider.tryGetTheme();
    this.applyTheme(this._themeVariant);
    this._themeProvider.themeChangedEvent.add(this, this._handleThemeChangedEvent);
    return super.onInit();
  }

  protected renderComponent(props: ISpfxChessWebPartProps): JSX.Element {
    this.syncChromeHiding(props.hidePageChrome === true);
    const componentProps: ISpfxChessProps = {
      eloKey: props.eloKey || 'club',
      playerColor: props.playerColor === 'w' || props.playerColor === 'b' ? props.playerColor : 'random',
      playerName: props.playerName || 'Player',
      listName: props.listName || 'Chess Games',
      autosave: props.autosave !== false,
      context: this.context,
    };
    return createComponent(SpfxChess, componentProps);
  }

  protected onDispose(): void {
    this._themeProvider?.themeChangedEvent.remove(this, this._handleThemeChangedEvent);
    this._themeProvider = undefined;
    this.syncChromeHiding(false);
    super.onDispose();
  }

  private _handleThemeChangedEvent(args: ThemeChangedEventArgs): void {
    this._themeVariant = args.theme;
    this.applyTheme(this._themeVariant);
  }

  private applyTheme(theme: IReadonlyTheme | undefined): void {
    if (!theme?.semanticColors || !theme.palette) {
      return;
    }
    const semanticColors = theme.semanticColors;
    const palette = theme.palette;
    this.domElement.style.setProperty('--sp-bg', semanticColors.bodyBackground ?? null);
    this.domElement.style.setProperty('--sp-card', semanticColors.bodyFrameBackground ?? semanticColors.bodyBackground ?? null);
    this.domElement.style.setProperty('--sp-text', semanticColors.bodyText ?? null);
    this.domElement.style.setProperty('--sp-muted', semanticColors.bodySubtext ?? null);
    this.domElement.style.setProperty('--sp-line', semanticColors.bodyDivider ?? null);
    this.domElement.style.setProperty('--sp-primary', palette.themePrimary ?? null);
    this.domElement.style.setProperty('--sp-primary-strong', palette.themeDarkAlt ?? palette.themeDark ?? null);
    this.domElement.style.setProperty('--sp-accent-soft', palette.themeLighter ?? null);
    this.domElement.dataset.theme = theme.isInverted ? 'dark' : 'light';
  }

  private syncChromeHiding(hide: boolean): void {
    if (hide === this._chromeHiding) {
      return;
    }
    this._chromeHiding = hide;
    try {
      if (hide) {
        const style = document.createElement('style');
        style.id = CHROME_STYLE_ID;
        style.textContent =
          '#SuiteNavPlaceholder, #SuiteNavPlaceHolder { display: none !important; }\n' +
          '#spLeftNav, #LeftNavigation { display: none !important; }';
        document.head.appendChild(style);
      } else {
        document.getElementById(CHROME_STYLE_ID)?.remove();
      }
    } catch {
      this._chromeHiding = !hide;
    }
  }

  protected override getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: 'Play chess against Stockfish Lite — a full engine running in your browser via WebAssembly. It never blinks.',
          },
          groups: [
            {
              groupName: 'Opponent & player',
              groupFields: [
                PropertyPaneDropdown('eloKey', {
                  label: 'Engine strength',
                  selectedKey: this.properties.eloKey ?? 'club',
                  options: ELO_LEVELS.map((level) => ({
                    key: level.key,
                    text: `${level.label} — ${level.elo} Elo`,
                  })),
                }),
                PropertyPaneDropdown('playerColor', {
                  label: 'Play as',
                  selectedKey: this.properties.playerColor ?? 'random',
                  options: [
                    { key: 'random', text: 'Random' },
                    { key: 'w', text: 'White' },
                    { key: 'b', text: 'Black' },
                  ],
                }),
                PropertyPaneTextField('playerName', {
                  label: 'Your name',
                  value: this.properties.playerName ?? 'Player',
                  maxLength: 60,
                }),
              ],
            },
            {
              groupName: 'Saved games',
              groupFields: [
                PropertyPaneTextField('listName', {
                  label: 'Games list name',
                  value: this.properties.listName ?? 'Chess Games',
                }),
                PropertyPaneToggle('autosave', {
                  label: 'Autosave finished games',
                  checked: this.properties.autosave ?? true,
                }),
              ],
            },
            {
              groupName: 'Page appearance',
              groupFields: [
                PropertyPaneLabel('hidePageChromeInfo', {
                  text: 'Best effort: hides the SharePoint suite bar and left nav so the web part gets more room. Not supported by Microsoft and may stop working if SharePoint changes its UI.',
                }),
                PropertyPaneToggle('hidePageChrome', {
                  label: 'Hide page chrome (suite bar & left navigation)',
                  checked: this.properties.hidePageChrome ?? false,
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
