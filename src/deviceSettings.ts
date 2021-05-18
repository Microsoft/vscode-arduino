// Copyright (c) Elektronik Workshop. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import * as constants from "./common/constants";
import * as util from "./common/util";
import * as logger from "./logger/logger";

/**
 * Generic class which provides monitoring of a specific settings value.
 * If the value is modified a flag is set and an event is emitted.
 *
 * Usually you want to specialize the setter for any given value type
 * to prevent invalid or badly formatted values to enter your settings.
 */
class Setting<T> {
    /** The setting's default value. */
    public readonly default: T;
    /** The actual value of the setting. */
    private _value: T | undefined;
    /** Indicates if the value was changed since the last call to this.commit(). */
    private _modified: boolean;
    /** Event emitter which fires when the value is changed. */
    private _emitter: vscode.EventEmitter<T> = new vscode.EventEmitter<T>();

    constructor(defaultValue?: T) {
        this.default = defaultValue;
        this._value = this.default;
    }
    /**
     * Value-setter - sets the value.
     * If modified, the modified flag is set and the modified event is
     * fired.
     */
    public set value(value: T | undefined) {
        if (value !== this._value) {
            this._value = value;
            this._modified = true;
            this._emitter.fire(this._value);
        }
    }
    /** Value-getter - returns the internal value. */
    public get value() {
        return this._value;
    }
    /**
     * Returns true, if the internal value has been modified.
     * To clear the modified flag call commit().
     */
    public get modified() {
        return this._modified;
    }
    /** Returns the modified-event emitter. */
    public get emitter() {
        return this._emitter;
    }
    /**
     * Returns the internal value to its default value.
     * If the default value is different from the previous value,
     * it triggers the modified event and the modified flag is set.
     */
    public reset() {
        this.value = this.default;
    }
    /** Reset the modified flag (if you know what you're doing) */
    public commit() {
        this._modified = false;
    }
}

/**
 * String specialization of the Setting class.
 */
class StrSetting extends Setting<string> {
    /**
     * When we override setter (below) we have to override getter as well
     * (see JS language specs).
     */
    public get value() {
        return super.value;
    }
    /**
     * Set string value. Anything else than a string will set the value to
     * its default value (undefined). White spaces at the front and back are
     * trimmed before setting the value.
     * If the setting's value is changed during this operation, the base
     * class' event emitter will fire and the modified flag will be set.
     */
    public set value(value: string) {
        if (typeof value !== "string") {
            value = this.default;
        } else {
            value = value.trim();
        }
        super.value = value;
    }
}

class BuildPrefSetting extends Setting<string[][]> {
    public get value() {
        return super.value;
    }
    public set value(value: string[][]) {
        if (!Array.isArray(value)) {
            super.value = super.default;
            return;
        }
        if (value.length <= 0) {
            super.value = super.default;
            return;
        }
        for (const pref of value) {
            if (!Array.isArray(pref) || pref.length !== 2) {
                super.value = super.default;
                return;
            }
            for (const i of pref) {
                if (typeof i !== "string") {
                    super.value = super.default;
                    return;
                }
            }
        }
        super.value = value;
    }
}

/**
 * This class encapsulates all device/project specific settings and
 * provides common operations on them.
 */
export class DeviceSettings {
    public port = new StrSetting();
    public board = new StrSetting();
    public sketch = new StrSetting();
    public output = new StrSetting();
    public debugger = new StrSetting();
    public intelliSenseGen = new StrSetting();
    public configuration = new StrSetting();
    public prebuild = new StrSetting();
    public successfulbuild = new StrSetting();
    public failedbuild = new StrSetting();
    public postbuild = new StrSetting();
    public programmer = new StrSetting();
    public buildPreferences = new  BuildPrefSetting();

    /**
     * @returns true if any of the settings values has its modified flag
     * set.
     */
    public get modified() {
        return this.port.modified ||
               this.board.modified ||
               this.sketch.modified ||
               this.output.modified ||
               this.debugger.modified ||
               this.intelliSenseGen.modified ||
               this.configuration.modified ||
               this.prebuild.modified ||
               this.successfulbuild.modified ||
               this.failedbuild.modified ||
               this.postbuild.modified ||
               this.programmer.modified ||
               this.buildPreferences.modified;
    }
    /**
     * Clear modified flags of all settings values.
     */
    public commit() {
        this.port.commit();
        this.board.commit();
        this.sketch.commit();
        this.output.commit();
        this.debugger.commit();
        this.intelliSenseGen.commit();
        this.configuration.commit();
        this.prebuild.commit();
        this.successfulbuild.commit();
        this.failedbuild.commit();
        this.postbuild.commit();
        this.programmer.commit();
        this.buildPreferences.commit();
    }
    /**
     * Resets all settings values to their default values.
     * @param commit If true clear the modified flags after all values are
     * reset.
     */
    public reset(commit: boolean = true) {
        this.port.reset();
        this.board.reset();
        this.sketch.reset();
        this.output.reset();
        this.debugger.reset();
        this.intelliSenseGen.reset();
        this.configuration.reset();
        this.prebuild.reset();
        this.successfulbuild.reset();
        this.failedbuild.reset();
        this.postbuild.reset();
        this.programmer.reset();
        this.buildPreferences.reset();
        if (commit) {
            this.commit();
        }
    }
    /**
     * Load settings values from the given file.
     * If a value is changed through this operation, its event emitter will
     * fire.
     * @param file Path to the file the settings should be loaded from.
     * @param commit If true reset the modified flags after all values are read.
     * @returns true if the settings are loaded successfully.
     */
    public load(file: string, commit: boolean = true) {
        const settings = util.tryParseJSON(fs.readFileSync(file, "utf8"));
        if (settings) {
            this.port.value = settings.port;
            this.board.value = settings.board;
            this.sketch.value = settings.sketch;
            this.configuration.value = settings.configuration;
            this.output.value = settings.output;
            this.debugger.value = settings.debugger;
            this.intelliSenseGen.value = settings.intelliSenseGen;
            this.prebuild.value = settings.prebuild;
            this.successfulbuild.value = settings.successfulbuild;
            this.failedbuild.value = settings.failedbuild;
            this.postbuild.value = settings.postbuild;
            this.programmer.value = settings.programmer;
            this.buildPreferences.value = settings.buildPreferences;
            if (commit) {
                this.commit();
            }
            return true;
        } else {
            logger.notifyUserError("arduinoFileError",
                new Error(constants.messages.ARDUINO_FILE_ERROR));
            return false;
        }
    }
    /**
     * Writes the settings to the given file if there are modified
     * values. The modification flags are reset (commit()) on successful write.
     * On write failure the modification flags are left unmodified.
     * @param file Path to file the JSON representation of the settings should
     * written to. If either the folder or the file does not exist they are
     * created.
     * @returns true on succes, false on write failure.
     */
    public save(file: string) {

        if (!this.modified) {
            return true;
        }

        let settings: any = {};
        if (util.fileExistsSync(file)) {
            settings = util.tryParseJSON(fs.readFileSync(file, "utf8"));
        }
        if (!settings) {
            logger.notifyUserError(
                "arduinoFileError",
                new Error(constants.messages.ARDUINO_FILE_ERROR));
            return false;
        }

        settings.sketch = this.sketch.value;
        settings.port = this.port.value;
        settings.board = this.board.value;
        settings.output = this.output.value;
        settings.debugger = this.debugger.value;
        settings.intelliSenseGen = this.intelliSenseGen.value;
        settings.configuration = this.configuration.value;
        settings.programmer = this.programmer.value;

        util.mkdirRecursivelySync(path.dirname(file));
        fs.writeFileSync(file, JSON.stringify(settings, undefined, 4));

        this.commit();

        return true;
    }
}
