/*
Copyright 2026 grasmanek94

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/ 

const STORAGE_KEY = "keep-removing-tracks";
const PLAYED_TRACKS_KEY = "queue-cleaner-played-tracks";

let keepRemovingInterval = null;
let menuItem = null;
let playedTracks = null;
let queueRevision = "";

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

async function removeNonEnhancedRecommendations() {
    const state = Spicetify.Player.data;

    if (
        !state?.restrictions?.canToggleSmartShuffle ||
        !state?.shuffle ||
        !state?.smartShuffle
    ) {
        console.log("Smart Shuffle not enabled.");
        return;
    }

    while (true) {
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
        await Spicetify.removeFromQueue(toRemove);

        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function removeListenedTracks() {
    while (true) {
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

    menuItem.element.style.opacity = enabled ? "1" : "0.25";
}

function toggleKeepRemoving() {
    let enabled = Spicetify.LocalStorage.get(STORAGE_KEY) === "true";
    enabled = !enabled;

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

function importPlaylistData(data) {
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

function importPlaylistDump(data) {
    if (!data) {
        throw new Error("Invalid data");
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
    input.accept = ".json,application/json";

    input.onchange = async event => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const text = await file.text();
        const data = JSON.parse(text);

        importPlaylistDump(data);
    };

    input.click();
}

function addPlayerTracker() {
    getPlayedTracks();

    Spicetify.Player.addEventListener("songchange", () => {
        const currentTrackUri = Spicetify.Player.data?.item?.uri;

        // Add newly started track
        if (currentTrackUri) {
            addPlayedTrack(currentTrackUri);
        }
    });

    new Spicetify.Playbar.Button(
        "Import listened tracks",
        "download",
        openImportDialog,
        false
    );
}

function addRemoverButtonsAndTimers() {
    let enabled = Spicetify.LocalStorage.get(STORAGE_KEY) === "true";

	menuItem = new Spicetify.Playbar.Button(
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

function main() {
    console.log("My extension loaded!");

	console.log("React:", Spicetify.React);
	console.log("ReactDOM:", Spicetify.ReactDOM);
	console.log("Menu:", Spicetify.Menu);
	console.log("Menu.Item:", Spicetify.Menu?.Item);

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
        },

        // Statistics
        stats() {
            return {
                trackCount: Object.keys(playedTracks).length,
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
                JSON.stringify(playedTracks)
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
