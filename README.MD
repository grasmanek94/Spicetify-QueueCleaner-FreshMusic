# Queue Cleaner
## Goal
This Spicetify extension keeps cleaning the queue (when enabled).
The goal is to *only* play music that hasn't been played before.

## Enabling
It can be enabled by clicking the check mark to the left of the queue button.
A notification will be shown that the cleaner is running ("ON").
State is saved and restored upon launching Spotify.

## How does it work?
The extension _only_ cleans when Smart Shuffle is enabled.  

Tracks that have been played in the past (while using this extension) will be saved and removed from the queue.  

Tracks that aren't recommended by smart shuffle will be removed from the queue too (so all tracks from the currently selected playlist will always be removed from the queue).

It is possible to import extended streaming data (from Spotify Account Data Download) and also playlists, which will be permanently saved (like all played tracks). These imported tracks will also be removed from queue.

## Notes
Somehow Spotify will often show "Spotify can't play this right now. If you have the file on your computer you can import it" when the extension is "cleaning the queue".

Works best with small playlists, if the playlist is too big it might cause the extension to lagg your Spotify client. I'll try to fix that in the future.

## Import/Export
A menu has been added which can be accessed by clicking the Profile Picture.
It's called 'Queue Cleaner'.

Import listened tracks allows importing:
- Exported backups
- Extended Spotify Streaming information (not basic streaming information unfortunately)
- Playlist exports from Spotify

There's also a menu entry to backup the current data (export).
