/*--------------------------------------------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *-------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as util from "../common/util";

import { ArduinoApp } from "./arduino";
import { IArduinoSettings } from "./settings";

export interface IExampleNode {
    name: string;
    path: string;
    isLeaf: boolean;
    children: IExampleNode[];
}

export class ExampleManager {

    constructor(private _settings: IArduinoSettings, private _arduinoApp: ArduinoApp) {
    }

    public async loadExamples() {
        const examples = [];
        // load Built-in Examples from examples folder under arduino installation directory.
        examples.push({
            name: "Built-in Examples",
            path: path.join(this._settings.arduinoPath, "examples"),
            children: this.parseExamples(this._settings.defaultExamplePath),
        });

        // load Examples from default libraries under arduino installation directory.
        examples.push({
            name: "Examples for any board",
            path: path.join(this._settings.arduinoPath, "libraries"),
            children: await this.parseExamplesFromLibrary(this._settings.defaultLibPath),
        });

        // load Examples from current board's firmware package directory.
        if (this._arduinoApp.boardManager.currentBoard) {
            const currentBoard = this._arduinoApp.boardManager.currentBoard;
            examples.push({
                name: `Examples for ${currentBoard.name}`,
                path: path.join(currentBoard.platform.rootBoardPath, "libraries"),
                children: await this.parseExamplesFromLibrary(path.join(currentBoard.platform.rootBoardPath, "libraries")),
            });
        }

        // load Examples from Custom Libraries
        examples.push({
            name: "Examples from Custom Libraries",
            path: this._settings.libPath,
            children: await this.parseExamplesFromLibrary(this._settings.libPath, true),
        });
        return examples;
    }

    private parseExamples(rootPath: string): IExampleNode[] {
        if (!util.directoryExistsSync(rootPath)) {
            return [];
        }
        const exampleFolders = glob.sync(path.join(rootPath, "**/**/"));
        // exampleFolders looks like as follows:
        // ["C:/Program Files (x86)/Arduino/examples/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/AnalogReadSerial/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/BareMinimum/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/Blink/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/DigitalReadSerial/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/Fade/",
        //  "C:/Program Files (x86)/Arduino/examples/01.Basics/ReadAnalogVoltage/",
        //  "C:/Program Files (x86)/Arduino/examples/02.Digital/",
        // ]
        const rootNode = <IExampleNode> {
            children: [],
        };
        const exampleMap = new Map<string, IExampleNode>();
        exampleMap.set(path.resolve(exampleFolders[0]), rootNode);
        for (let i = 1; i < exampleFolders.length; i++) {
            const currentPath = path.resolve(exampleFolders[i]);
            const parentPath = path.resolve(path.dirname(exampleFolders[i]));
            const parentExample = exampleMap.get(parentPath);
            if (parentExample && !parentExample.isLeaf) {
                const currentExample = <IExampleNode> {
                    name: path.basename(exampleFolders[i]),
                    path: currentPath,
                    isLeaf: this.isExampleFolder(currentPath), // If *ino file exists on the first level child, then mark this folder as leaf node.
                    children: [],
                };
                exampleMap.set(currentPath, currentExample);
                parentExample.children.push(currentExample);
            }
        }

        return rootNode.children;
    }

    private async parseExamplesFromLibrary(rootPath: string, needParsingIncompatible: boolean = false) {
        const examples = [];
        const inCompatibles = [];
        const libraries = util.readdirSync(rootPath, true);
        for (const library of libraries) {
            const propertiesFile = path.join(rootPath, library, "library.properties");
            if (util.fileExistsSync(propertiesFile)) {
                const properties = <any>await util.parseProperties(propertiesFile);
                const children = this.parseExamples(path.join(rootPath, library, "examples"));
                if (children.length) {
                    if (this.isSupported(properties.architectures)) {
                        examples.push({
                            name: library,
                            path: path.join(rootPath, library),
                            children,
                        });
                    } else if (needParsingIncompatible) {
                        inCompatibles.push({
                            name: library,
                            path: path.join(rootPath, library),
                            children,
                        });
                    }
                }
            }
        }
        if (needParsingIncompatible && inCompatibles.length) {
            examples.push({
                name: "INCOMPATIBLE",
                path: "INCOMPATIBLE",
                children: inCompatibles,
            });
        }
        return examples;
    }

    private isExampleFolder(dirname) {
        const items = fs.readdirSync(dirname);
        const ino = items.find((item) => {
            return util.fileExistsSync(path.join(dirname, item)) && item.endsWith(".ino");
        });
        return !!ino;
    }

    private isSupported(architectures) {
        if (!architectures) {
            return false;
        }
        const currentBoard = this._arduinoApp.boardManager.currentBoard;
        if (!currentBoard) {
            return true;
        }

        const targetArch = currentBoard.platform.architecture;
        return architectures.indexOf(targetArch) >= 0 || architectures.indexOf("*") >= 0;
    }
}
