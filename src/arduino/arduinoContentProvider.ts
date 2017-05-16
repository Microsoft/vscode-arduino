/*--------------------------------------------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *-------------------------------------------------------------------------------------------*/

import * as path from "path";
import * as Uuid from "uuid/v4";
import * as vscode from "vscode";
import * as Constants from "../common/constants";
import * as JSONHelper from "../common/cycle";
import * as Logger from "../logger/logger";
import { ArduinoApp } from "./arduino";
import { IArduinoSettings } from "./arduinoSettings";
import { BoardManager } from "./boardManager";
import { LibraryManager } from "./libraryManager";
import LocalWebServer from "./localWebServer";
import { VscodeSettings } from "./vscodeSettings";

export class ArduinoContentProvider implements vscode.TextDocumentContentProvider {
    private _webserver: LocalWebServer;
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    constructor(
        private _settings: IArduinoSettings,
        private _arduinoApp: ArduinoApp,
        private _extensionPath: string) {
        this.initialize();
    }

    public initialize() {
        this._webserver = new LocalWebServer(this._extensionPath);
        // Arduino Boards Manager
        this.addHandlerWithLogger("show-boardmanager", "/boardmanager", (req, res) => this.getHtmlView(req, res));
        this.addHandlerWithLogger("show-packagemanager", "/api/boardpackages", async (req, res) => await this.getBoardPackages(req, res));
        this.addHandlerWithLogger("install-board", "/api/installboard", async (req, res) => await this.installPackage(req, res), true);
        this.addHandlerWithLogger("uninstall-board", "/api/uninstallboard", async (req, res) => await this.uninstallPackage(req, res), true);
        this.addHandlerWithLogger("open-link", "/api/openlink", async (req, res) => await this.openLink(req, res), true);
        this.addHandlerWithLogger("open-settings", "/api/opensettings", (req, res) => this.openSettings(req, res), true);

        // Arduino Libraries Manager
        this.addHandlerWithLogger("show-librarymanager", "/librarymanager", (req, res) => this.getHtmlView(req, res));
        this.addHandlerWithLogger("load-libraries", "/api/libraries", async (req, res) => await this.getLibraries(req, res));
        this.addHandlerWithLogger("install-library", "/api/installlibrary", async (req, res) => await this.installLibrary(req, res), true);
        this.addHandlerWithLogger("uninstall-library", "/api/uninstalllibrary", async (req, res) => await this.uninstallLibrary(req, res), true);
        this.addHandlerWithLogger("add-libpath", "/api/addlibpath", async (req, res) => await this.addLibPath(req, res), true);

        // Arduino Board Config
        this.addHandlerWithLogger("show-boardconfig", "/boardconfig", (req, res) => this.getHtmlView(req, res));
        this.addHandlerWithLogger("load-configitems", "/api/configitems", async (req, res) => await this.getBoardConfig(req, res));
        this.addHandlerWithLogger("update-config", "/api/updateconfig", async (req, res) => await this.updateConfig(req, res), true);

        // Arduino Examples TreeView
        this.addHandlerWithLogger("show-examplesview", "/examples", (req, res) => this.getHtmlView(req, res));
        this.addHandlerWithLogger("load-examples", "/api/examples", async (req, res) => await this.getExamples(req, res));
        this.addHandlerWithLogger("open-example", "/api/openexample", (req, res) => this.openExample(req, res), true);

        this._webserver.start();
    }

    public provideTextDocumentContent(uri: vscode.Uri) {
        let type = "";
        if (uri.toString() === Constants.BOARD_MANAGER_URI.toString()) {
            type = "boardmanager";
        } else if (uri.toString() === Constants.LIBRARY_MANAGER_URI.toString()) {
            type = "librarymanager";
        } else if (uri.toString() === Constants.BOARD_CONFIG_URI.toString()) {
            type = "boardConfig";
        } else if (uri.toString() === Constants.EXAMPLES_URI.toString()) {
            type = "examples";
        }

        const timeNow = new Date().getTime();
        return `
        <html>
        <head>
            <script type="text/javascript">
                window.onload = function(event) {
                    console.log('reloaded results window at time ${timeNow}ms');
                    var doc = document.documentElement;
                    var styles = window.getComputedStyle(doc);
                    var backgroundcolor = styles.getPropertyValue('--background-color') || '#1e1e1e';
                    var color = styles.getPropertyValue('--color') || '#d4d4d4';
                    var theme = document.body.className || 'vscode-dark';
                    var url = "${this._webserver.getEndpointUri(type)}?" +
                            "theme=" + encodeURIComponent(theme.trim()) +
                            "&backgroundcolor=" + encodeURIComponent(backgroundcolor.trim()) +
                            "&color=" + encodeURIComponent(color.trim());
                    document.getElementById('frame').src = url;
                };
            </script>
        </head>
        <body style="margin: 0; padding: 0; height: 100%; overflow: hidden;">
            <iframe id="frame" width="100%" height="100%" frameborder="0" style="position:absolute; left: 0; right: 0; bottom: 0; top: 0px;"/>
        </body>
        </html>`;
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    public getHtmlView(req, res) {
        return res.sendFile(path.join(this._extensionPath, "./out/views/index.html"));
    }

    public async getBoardPackages(req, res) {
        const update = (VscodeSettings.getIntance().autoUpdateIndexFiles && req.query.update === "true");
        await this._arduinoApp.boardManager.loadPackages(update);
        return res.json({
            platforms: JSONHelper.decycle(this._arduinoApp.boardManager.platforms, undefined),
        });
    }

    public async installPackage(req, res) {
        if (!req.body.packageName || !req.body.arch) {
            return res.status(400).send("BAD Request! Missing { packageName, arch } parameters!");
        } else {
            try {
                await this._arduinoApp.installBoard(req.body.packageName, req.body.arch, req.body.version);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Install board failed with message "code:${error.code}, err:${error.stderr}"`);
            }
        }
    }

    public async uninstallPackage(req, res) {
        if (!req.body.packagePath) {
            return res.status(400).send("BAD Request! Missing { packagePath } parameter!");
        } else {
            try {
                await this._arduinoApp.uninstallBoard(req.body.boardName, req.body.packagePath);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Uninstall board failed with message "${error}"`);
            }
        }
    }

    public async openLink(req, res) {
        if (!req.body.link) {
            return res.status(400).send("BAD Request! Missing { link } parameter!");
        } else {
            try {
                await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(req.body.link));
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Cannot open the link with error message "${error}"`);
            }
        }
    }

    public openSettings(req, res) {
        vscode.commands.executeCommand("workbench.action.openGlobalSettings");
        return res.json({
            status: "OK",
        });
    }

    public async getLibraries(req, res) {
        const update = (VscodeSettings.getIntance().autoUpdateIndexFiles && req.query.update === "true");
        await this._arduinoApp.libraryManager.loadLibraries(update);
        return res.json({
            libraries: this._arduinoApp.libraryManager.libraries,
        });
    }

    public async installLibrary(req, res) {
        if (!req.body.libraryName) {
            return res.status(400).send("BAD Request! Missing { libraryName } parameters!");
        } else {
            try {
                await this._arduinoApp.installLibrary(req.body.libraryName, req.body.version);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Install library failed with message "code:${error.code}, err:${error.stderr}"`);
            }
        }
    }

    public async uninstallLibrary(req, res) {
        if (!req.body.libraryPath) {
            return res.status(400).send("BAD Request! Missing { libraryPath } parameters!");
        } else {
            try {
                await this._arduinoApp.uninstallLibrary(req.body.libraryName, req.body.libraryPath);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Uninstall library failed with message "code:${error.code}, err:${error.stderr}"`);
            }
        }
    }

    public async addLibPath(req, res) {
        if (!req.body.libraryPath) {
            return res.status(400).send("BAD Request! Missing { libraryPath } parameters!");
        } else {
            try {
                await this._arduinoApp.addLibPath(req.body.libraryPath);
                await this._arduinoApp.includeLibrary(req.body.libraryPath);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Add library path failed with message "code:${error.code}, err:${error.stderr}"`);
            }
        }
    }

    public async getBoardConfig(req, res) {
        return res.json({
            configitems: this._arduinoApp.boardManager.currentBoard.configItems,
        });
    }

    public async updateConfig(req, res) {
        if (!req.body.configId || !req.body.optionId) {
            return res.status(400).send("BAD Request! Missing parameters!");
        } else {
            try {
                this._arduinoApp.boardManager.currentBoard.updateConfig(req.body.configId, req.body.optionId);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Update board config failed with message "code:${error.code}, err:${error.stderr}"`);
            }
        }
    }

    public async getExamples(req, res) {
        const examples = await this._arduinoApp.exampleManager.loadExamples();
        return res.json({
            examples,
        });
    }

    public openExample(req, res) {
        if (!req.body.examplePath) {
            return res.status(400).send("BAD Request! Missing { examplePath } parameter!");
        } else {
            try {
                this._arduinoApp.openExample(req.body.examplePath);
                return res.json({
                    status: "OK",
                });
            } catch (error) {
                return res.status(500).send(`Cannot open the example folder with error message "${error}"`);
            }
        }
    }

    private async addHandlerWithLogger(handlerName: string, url: string, handler: (req, res) => void, post: boolean = false): Promise<void> {
        const wrappedHandler = async (req, res) => {
            const guid = Uuid().replace(/\-/g, "");
            let properties = {};
            if (post) {
                properties = { ...req.body };
            }
            Logger.traceUserData(`start-` + handlerName, { correlationId: guid, ...properties });
            const timer1 = new Logger.Timer();
            try {
                await Promise.resolve(handler(req, res));
            } catch (error) {
                Logger.traceError("expressHandlerError", error, { correlationId: guid, handlerName, ...properties });
            }
            Logger.traceUserData(`end-` + handlerName, { correlationId: guid, duration: timer1.end() });
        };
        if (post) {
            this._webserver.addPostHandler(url, wrappedHandler);
        } else {
            this._webserver.addHandler(url, wrappedHandler);
        }
    }
}
