/*
Copyright 2026 grasmanek94

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/ 

const STORAGE_KEY = "keep-removing-tracks";
const PLAYED_TRACKS_KEY = "queue-cleaner-played-tracks";

let keepRemovingInterval = null;
let enableButton = null;
let playedTracks = null;
let queueRevision = "";
let queueCleanerMenu = null;
let keepRemovingEnabled = false;
let previousTrack = null;

function getPlayedTracks() {
    try {
        playedTracks = JSON.parse(
            Spicetify.LocalStorage.get(PLAYED_TRACKS_KEY) || "{}"
        );
    } catch (e) {
        console.error("Failed to load played tracks", e);
        playedTracks = {};
    }

    return playedTracks;
}

function addPlayedTrack(uri) {
    if (!uri) {
        return;
    }

    if(playedTracks === null) {
        getPlayedTracks();
    }

    if(hasPlayedTrack(uri)) {
        return;
    }

    playedTracks[uri] = true;

    Spicetify.LocalStorage.set(
        PLAYED_TRACKS_KEY,
        JSON.stringify(playedTracks)
    );
}

function hasPlayedTrack(uri) {
    if(playedTracks === null) {
        getPlayedTracks();
    }

    return !!playedTracks[uri];
}

async function banTracksInRadio(contextTracks) {
    let state = Spicetify.Platform.PlayerAPI.getState();

    if( state === null || 
        state.context === null || 
        state.context.metadata === null ||
        state.context.metadata.context_owner !== "spotify" ||
        state.context.metadata.format_list_type !== "inspiredby-mix") {
        return;
    }

    for (const contextTrack of contextTracks) {
        await Spicetify.Platform.FeedbackAPI.addContextTrackBan(
            state.context.uri,
            contextTrack.uri,
            "context"
        );

        await Spicetify.Platform.FeedbackAPI.addContextTrackBan(
            state.context.uri,
            contextTrack.uri
        );
    }
}

async function removeNonEnhancedRecommendations() {
    const state = Spicetify.Player.data;

    if (
        !state?.restrictions?.canToggleSmartShuffle ||
        !state?.smartShuffle
    ) {
        console.log("Smart Shuffle not enabled, skipping recommended track search.");
        return;
    }

    while (keepRemovingEnabled) {
        const toRemove = Spicetify.Queue.nextTracks
            .map(track => track?.contextTrack)
            .filter(
                track =>
                    track &&
                    track.metadata?.provider !== "enhanced_recommendation"
            );

        if (!toRemove.length) {
            console.log("No more non-enhanced tracks found.");
            break;
        }

        console.log(`Removing ${toRemove.length} track(s)...`);
        await banTracksInRadio(toRemove);
        await Spicetify.removeFromQueue(toRemove);

        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function removeListenedTracks() {
    while (keepRemovingEnabled) {
        const toRemove = Spicetify.Queue.nextTracks
            .map(track => track?.contextTrack)
            .filter(
                track =>
                    track?.uri &&
                    hasPlayedTrack(track.uri)
            );

        if (!toRemove.length) {
            console.log("No more listened tracks found.");
            break;
        }

        console.log(`Removing ${toRemove.length} listened track(s)...`);
        await banTracksInRadio(toRemove);
        await Spicetify.removeFromQueue(toRemove);

        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function removeUnwantedTracks() {
    const currentRevision = Spicetify.Queue.queueRevision;

    if (queueRevision === currentRevision) {
        return;
    }

    queueRevision = currentRevision;

    await removeNonEnhancedRecommendations().catch(console.error);
    await removeListenedTracks().catch(console.error);
}

function startKeepRemoving() {
    if (keepRemovingInterval) {
        return;
    }

    removeUnwantedTracks().catch(console.error);

    keepRemovingInterval = setInterval(() => {
        removeUnwantedTracks().catch(console.error);
    }, 1_000);
}

function stopKeepRemoving() {
    clearInterval(keepRemovingInterval);
    keepRemovingInterval = null;
}

function updateButton() {
    const enabled =
        Spicetify.LocalStorage.get(STORAGE_KEY) === "true";

    enableButton.element.style.opacity = enabled ? "1" : "0.25";
}

function toggleKeepRemoving() {
    let enabled = Spicetify.LocalStorage.get(STORAGE_KEY) === "true";
    enabled = !enabled;

    keepRemovingEnabled = enabled;
    Spicetify.LocalStorage.set(STORAGE_KEY, String(enabled));

    if (enabled) {
        startKeepRemoving();
    } else {
        stopKeepRemoving();
    }

    updateButton();
    Spicetify.showNotification(
        `Keep removing: ${enabled ? "ON" : "OFF"}`
    );
}

function importPlaylistExport(data) {
    let imported = 0;

    if(playedTracks === null) {
        getPlayedTracks();
    }

    for (const playlist of Object.values(data.playlists)) {
        for (const track of playlist.tracks) {
            if (!playedTracks[track.uri]) {
                playedTracks[track.uri] = true;
                imported++;
            }
        }
    }

    Spicetify.LocalStorage.set(
        PLAYED_TRACKS_KEY,
        JSON.stringify(playedTracks)
    );

    Spicetify.showNotification(
        `Imported ${imported} tracks`
    );
}

function importStreamingHistory(data) {
    throw new Error("Import Streaming History Not Implemented Yet");
}

function importExtendedStreamingHistory(data) {
    let imported = 0;

    if (playedTracks === null) {
        getPlayedTracks();
    }

    for (const entry of data) {
        const uri = entry?.spotify_track_uri;

        // Skip podcasts, missing tracks, etc.
        if (!uri) {
            continue;
        }

        if (!playedTracks[uri]) {
            playedTracks[uri] = true;
            imported++;
        }
    }

    Spicetify.LocalStorage.set(
        PLAYED_TRACKS_KEY,
        JSON.stringify(playedTracks)
    );

    Spicetify.showNotification(
        `Imported ${imported} tracks from extended streaming history`
    );
}

function importPlayedTracksExport(data) {
    let imported = 0;

    if (playedTracks === null) {
        getPlayedTracks();
    }

    for (const uri of Object.keys(data)) {
        if (!playedTracks[uri]) {
            playedTracks[uri] = true;
            imported++;
        }
    }

    Spicetify.LocalStorage.set(
        PLAYED_TRACKS_KEY,
        JSON.stringify(playedTracks)
    );

    Spicetify.showNotification(
        `Imported ${imported} exported tracks`
    );
}

function importPlaylistDump(data) {
    if (!data) {
        throw new Error("Invalid data");
    }

    // Own export format
    if (
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).some(
            key => key.startsWith("spotify:track:")
        )
    ) {
        console.log("Detected played tracks export");
        return importPlayedTracksExport(data);
    }

    // Playlist export
    if (
        data.playlists &&
        typeof data.playlists === "object"
    ) {
        console.log("Detected playlist dump");
        return importPlaylistExport(data);
    }

    if (Array.isArray(data) && data.length > 0) {
        const first = data[0];

        // Simple Streaming History
        if (
            first.endTime &&
            first.artistName &&
            first.trackName
        ) {
            console.log("Detected streaming history");
            return importStreamingHistory(data);
        }

        // Extended Streaming History
        if (
            first.ts &&
            (
                first.spotify_track_uri ||
                first.master_metadata_track_name
            )
        ) {
            console.log("Detected extended streaming history");
            return importExtendedStreamingHistory(data);
        }
    }

    throw new Error(
        "Unknown import format"
    );
}

function openImportDialog() {
    const input = document.createElement("input");

    input.type = "file";
    input.multiple = true;
    input.accept = ".json,application/json";

    input.onchange = async event => {
        for (const file of event.target.files) {
            const text = await file.text();
            const data = JSON.parse(text);
            importPlaylistDump(data);
        }
    };

    input.click();
}

function addPlayerTracker() {
    getPlayedTracks();

    Spicetify.Player.addEventListener("songchange", () => {
        if(previousTrack !== null && keepRemovingEnabled) {
            banTracksInRadio([previousTrack]);
        }

        const currentTrackUri = Spicetify.Player.data?.item?.uri;
        previousTrack = Spicetify.Player.data?.item;

        // Add newly started track
        if (currentTrackUri) {
            addPlayedTrack(currentTrackUri);
        }
    });
}

function addRemoverButtonsAndTimers() {
    let enabled = Spicetify.LocalStorage.get(STORAGE_KEY) === "true";

	enableButton = new Spicetify.Playbar.Button(
        "Keep removing tracks",
        "check",
        toggleKeepRemoving,
        false
    );

    if (enabled) {
        startKeepRemoving();
    }

    updateButton();
}

    // Download JSON
function downloadTracks() {
    const blob = new Blob(
        [JSON.stringify(playedTracks ?? {}, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `played-tracks-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

function addMenu() {
    queueCleanerMenu = new Spicetify.Menu.SubMenu(
        "Queue Cleaner",
        [
            new Spicetify.Menu.Item(
                "Import listened tracks",
                false,
                openImportDialog
            ),

            new Spicetify.Menu.Item(
                "Export listened tracks",
                false,
                downloadTracks
            ),

            /*new Spicetify.Menu.Item(
                "Clear listened tracks",
                false,
                () => queue_cleaner.clear()
            )*/
        ]
    );

    queueCleanerMenu.register();
}

function main() {
    console.log("My extension loaded!");

	console.log("React:", Spicetify.React);
	console.log("ReactDOM:", Spicetify.ReactDOM);
	console.log("Menu:", Spicetify.Menu);
	console.log("Menu.Item:", Spicetify.Menu?.Item);

    addMenu();
    addRemoverButtonsAndTimers();
    addPlayerTracker();

    window.queue_cleaner = {
        // State
        get playedTracks() {
            return playedTracks;
        },

        get playedTrackCount() {
            return Object.keys(playedTracks ?? {}).length;
        },

        get enabled() {
            return Spicetify.LocalStorage.get(STORAGE_KEY) === "true";
        },

        get queueRevision() {
            return queueRevision;
        },

        // Queries
        hasPlayedTrack,

        // Actions
        addPlayedTrack,
        removeUnwantedTracks,
        removeListenedTracks,
        removeNonEnhancedRecommendations,
        openImportDialog,

        // Raw storage
        getStorage() {
            return JSON.parse(
                Spicetify.LocalStorage.get(PLAYED_TRACKS_KEY) || "{}"
            );
        },

        // Export as object
        exportObject() {
            return structuredClone(playedTracks ?? {});
        },

        // Export as URI array
        exportArray() {
            return Object.keys(playedTracks ?? {});
        },

        // Download JSON
        download() {
            downloadTracks();
        },

        // Statistics
        stats() {
            return {
                trackCount: Object.keys(playedTracks ?? {}).length,
                enabled:
                    Spicetify.LocalStorage.get(STORAGE_KEY) === "true",
                timerRunning: keepRemovingInterval !== null,
                queueRevision
            };
        },

        // Clear database
        clear() {
            playedTracks = {};

            Spicetify.LocalStorage.set(
                PLAYED_TRACKS_KEY,
                "{}"
            );

            console.log("Played tracks cleared.");
        },

        save() {
            Spicetify.LocalStorage.set(
                PLAYED_TRACKS_KEY,
                JSON.stringify(playedTracks ?? {})
            );
        }
    };
}

(function init() {
    if (!Spicetify.Player || 
        !Spicetify.Platform || 
        !Spicetify.React || 
        !Spicetify.ReactDOM ||
        !Spicetify.Menu) 
    {
        setTimeout(init, 100);
        return;
    }

    main();
})();
