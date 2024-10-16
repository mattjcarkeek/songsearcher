import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';

interface Song {
  id: string;
  name: string;
  artists: string;
  playlists: string[];
  albumCover: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Lone Star Song Deleter';
  playlists: any[] = [];
  allSongs: Song[] = [];
  searchResults: Song[] = [];
  deletedSongs: { song: Song, playlists: string[] }[] = [];
  private spotify: SpotifyApi;

  private playlistIds = [
    '5yeiIBl8YttUOvfvs0kXNs',
    '1HgIJqYLqxKhgrw5jXALrb',
    '0UWQxGY3dNsUTdlDJcMJH2'
  ];

  constructor() {
    this.spotify = SpotifyApi.withImplicitGrant(
      'f93a05bca4ee42888f07134fefd4deb0',
      'http://localhost:4200/callback',
      ['playlist-modify-public', 'playlist-modify-private']
    );
  }

  async ngOnInit() {
    await this.spotify.authenticate();
    await this.loadAllSongs();
  }

  async loadAllSongs() {
    for (const playlistId of this.playlistIds) {
      const playlist = await this.spotify.playlists.getPlaylist(playlistId);
      this.playlists.push(playlist);

      let offset = 0;
      let hasMoreTracks = true;

      while (hasMoreTracks) {
        const tracks = await this.spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, 50, offset);
        
        for (const item of tracks.items) {
          const song: Song = {
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map(artist => artist.name).join(', '),
            playlists: [playlist.name],
            albumCover: item.track.album.images[0]?.url || ''
          };

          const existingSong = this.allSongs.find(s => s.name === song.name && s.artists === song.artists);
          if (existingSong) {
            existingSong.playlists.push(playlist.name);
          } else {
            this.allSongs.push(song);
          }
        }

        if (tracks.items.length < 50) {
          hasMoreTracks = false;
        } else {
          offset += 50;
        }
      }
    }
  }

  searchSongs(query: string) {
    const lowercaseQuery = query.toLowerCase();
    this.searchResults = this.allSongs.filter(song =>
      song.name.toLowerCase().includes(lowercaseQuery) ||
      song.artists.toLowerCase().includes(lowercaseQuery)
    );
  }

  async deleteSong(song: Song, playlistName: string) {
    try {
      const playlist = this.playlists.find(p => p.name === playlistName);
      if (!playlist) {
        console.error('Playlist not found');
        return;
      }

      await this.spotify.playlists.removeItemsFromPlaylist(playlist.id, {
        tracks: [{ uri: `spotify:track:${song.id}` }]
      });
    
      // Remove the playlist from the song's playlists array
      const songIndex = this.allSongs.findIndex(s => s.id === song.id);
      if (songIndex !== -1) {
        this.allSongs[songIndex].playlists = this.allSongs[songIndex].playlists.filter(p => p !== playlistName);
        if (this.allSongs[songIndex].playlists.length === 0) {
          this.allSongs.splice(songIndex, 1);
        }
      }

      // Update search results
      const searchResultIndex = this.searchResults.findIndex(s => s.id === song.id);
      if (searchResultIndex !== -1) {
        this.searchResults[searchResultIndex].playlists = this.searchResults[searchResultIndex].playlists.filter(p => p !== playlistName);
        if (this.searchResults[searchResultIndex].playlists.length === 0) {
          this.searchResults.splice(searchResultIndex, 1);
        }
      }
    
      // Add or update the song in the deletedSongs array
      const deletedSongIndex = this.deletedSongs.findIndex(ds => ds.song.id === song.id);
      if (deletedSongIndex !== -1) {
        this.deletedSongs[deletedSongIndex].playlists.push(playlistName);
      } else {
        this.deletedSongs.push({ song, playlists: [playlistName] });
      }
    
      console.log(`Song "${song.name}" removed from playlist "${playlistName}"`);
    } catch (error) {
      console.error('Error removing song:', error);
    }
  }

  async deleteFromAllLists(song: Song) {
    for (const playlistName of song.playlists) {
      await this.deleteSong(song, playlistName);
    }
  }
}