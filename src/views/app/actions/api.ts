// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

function postHTTP(url, postData) {
    const request = new Request(url, {
        method: "POST",
        headers: new Headers({
            "Content-Type": "application/json",
        }),
        body: JSON.stringify(postData),
    });
    return window.fetch(request);
}

export function getBoardPackages(update) {
    return window.fetch(`/api/boardpackages?update=${update}`).then((response) => response.json());
}

export function installBoard(packageName, arch, version) {
    return postHTTP("/api/installboard", {
        packageName,
        arch,
        version,
    }).then((response) => response.json());
}

export function uninstallBoard(boardName, packagePath) {
    return postHTTP("/api/uninstallboard", {
        boardName,
        packagePath,
    }).then((response) => response.json());
}

export function openLink(link) {
    return postHTTP("/api/openlink", {
        link,
    }).then((response) => response.json());
}

export function openSettings() {
    return postHTTP("/api/opensettings", {}).then((response) => response.json());
}

export function getLibraries(update) {
    return window.fetch(`/api/libraries?update=${update}`).then((response) => response.json());
}

export function installLibrary(libraryName, version) {
    return postHTTP("/api/installlibrary", {
        libraryName,
        version,
    }).then((response) => response.json());
}

export function uninstallLibrary(libraryName, libraryPath) {
    return postHTTP("/api/uninstalllibrary", {
        libraryName,
        libraryPath,
    }).then((response) => response.json());
}

export function addLibPath(libraryPath) {
    return postHTTP("/api/addlibpath", {
        libraryPath,
    }).then((response) => response.json());
}

export function getInstalledBoards() {
    return window.fetch(`/api/installedboards`).then((response) => response.json());
}

export function updateSelectedBoard(boardId) {
    return postHTTP("/api/updateselectedboard", {
        boardId,
    }).then((response) => response.json());
}

export function getConfigItems() {
    return window.fetch(`/api/configitems`).then((response) => response.json());
}

export function updateConfigItem(configId, optionId) {
    return postHTTP("/api/updateconfig", {
        configId,
        optionId,
    }).then((response) => response.json());
}

export function getExamples() {
    return window.fetch("/api/examples").then((response) => response.json());
}

export function openExample(examplePath) {
    return postHTTP("/api/openexample", {
        examplePath,
    }).then((response) => response.json());
}

export function updatePlotRefreshRate(rate) {
    return postHTTP("/api/updateplotrate", {
        rate,
    }).then((response) => response.json());
}
