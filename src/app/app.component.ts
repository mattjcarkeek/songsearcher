import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SpotifyApi, AccessToken } from '@spotify/web-api-ts-sdk';
import { CommonModule } from '@angular/common';

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
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Lone Star Song Searcher';
  playlists: any[] = [];
  allSongs: Song[] = [];
  searchResults: Song[] = [];
  deletedSongs: { song: Song, playlists: string[] }[] = [];
  private spotify: SpotifyApi | null = null;
  isSearching: boolean = false;
  spotlightArtists: { [playlistId: string]: { name: string, artist: string, image: string } } = {};
  editingSpotlight: string | null = null;
  spotlightSearchResults: { [playlistId: string]: any[] } = {};
  selectedArtistForSpotlight: string | null = null;
  errorMessage: string | null = null;
  isAuthenticated: boolean = false;

  private playlistIds = [
    '5yeiIBl8YttUOvfvs0kXNs',
    '1HgIJqYLqxKhgrw5jXALrb',
    '0UWQxGY3dNsUTdlDJcMJH2',
    '3eufB5nRCDdmsx64WJVCwm',
    '6dR3uyMfA0a8zQ6VLsjI4I',
    '4L7nQ4qrIQWpAfHgO3w6ky',
    '2TBKaR9eCiN7Rrtc0Sml5d'
  ];

  private clientId = 'f93a05bca4ee42888f07134fefd4deb0';
  private redirectUri = 'https://mattjcarkeek.github.io/songsearcher/';
  private scopes = ['playlist-modify-public', 'playlist-modify-private'];

  constructor() {}

  async ngOnInit() {
    const params = new URLSearchParams(window.location.hash.substr(1));
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (accessToken && expiresIn) {
      this.handleAuthenticationCallback(accessToken, expiresIn);
    }
  }

  login() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(this.scopes.join(' '))}&response_type=token`;
    window.location.href = authUrl;
  }

  private handleAuthenticationCallback(accessToken: string, expiresIn: string) {
    const tokenExpirationTimestamp = Date.now() + parseInt(expiresIn) * 1000;
    const accessTokenObject: AccessToken = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: parseInt(expiresIn),
      expires: tokenExpirationTimestamp,
      refresh_token: ''
    };
    this.spotify = SpotifyApi.withAccessToken(this.clientId, accessTokenObject);
    this.isAuthenticated = true;
    this.loadAllSongs();
    this.determineSpotlightArtists();
  }

  async loadAllSongs() {
    if (!this.spotify) {
      console.error('Spotify API not initialized');
      return;
    }

    for (const playlistId of this.playlistIds) {
      const playlist = await this.spotify.playlists.getPlaylist(playlistId);
      this.playlists.push(playlist);

      let offset = 0;
      let hasMoreTracks = true;

      while (hasMoreTracks) {
        const tracks = await this.spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, 50, offset);
        
        for (const item of tracks.items) {
          if (item.track) {
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
    if (!this.spotify) {
      console.error('Spotify API not initialized');
      return;
    }

    try {
      const playlist = this.playlists.find(p => p.name === playlistName);
      if (!playlist) {
        console.error('Playlist not found');
        return;
      }

      await this.spotify.playlists.removeItemsFromPlaylist(playlist.id, {
        tracks: [{ uri: `spotify:track:${song.id}` }]
      });
    
      const songIndex = this.allSongs.findIndex(s => s.id === song.id);
      if (songIndex !== -1) {
        this.allSongs[songIndex].playlists = this.allSongs[songIndex].playlists.filter(p => p !== playlistName);
        if (this.allSongs[songIndex].playlists.length === 0) {
          this.allSongs.splice(songIndex, 1);
        }
      }

      const searchResultIndex = this.searchResults.findIndex(s => s.id === song.id);
      if (searchResultIndex !== -1) {
        this.searchResults[searchResultIndex].playlists = this.searchResults[searchResultIndex].playlists.filter(p => p !== playlistName);
        if (this.searchResults[searchResultIndex].playlists.length === 0) {
          this.searchResults.splice(searchResultIndex, 1);
        }
      }
    
      const deletedSongIndex = this.deletedSongs.findIndex(ds => ds.song.id === song.id);
      if (deletedSongIndex !== -1) {
        this.deletedSongs[deletedSongIndex].playlists.push(playlistName);
      } else {
        this.deletedSongs.push({ song, playlists: [playlistName] });
      }
    
      console.log(`Song "${song.name}" removed from playlist "${playlistName}"`);
    } catch (error) {
      this.errorMessage = 'Failed to apply. Make sure you are signed in.';
      this.clearErrorMessage();
      console.error('Error removing song:', error);
    }
  }

  async deleteFromAllLists(song: Song) {
    for (const playlistName of song.playlists) {
      await this.deleteSong(song, playlistName);
    }
  }

  async determineSpotlightArtists() {
    if (!this.spotify) {
      console.error('Spotify API not initialized');
      return;
    }

    const spotlightPlaylistIds = [
      '3eufB5nRCDdmsx64WJVCwm',
      '6dR3uyMfA0a8zQ6VLsjI4I',
      '4L7nQ4qrIQWpAfHgO3w6ky'
    ];

    for (const playlistId of spotlightPlaylistIds) {
      const playlist = await this.spotify.playlists.getPlaylist(playlistId);
      const tracks = await this.spotify.playlists.getPlaylistItems(playlistId);

      if (tracks.items.length === 0) {
        // Handle empty playlist
        this.spotlightArtists[playlistId] = {
          name: playlist.name,
          artist: '<empty>',
          image: ''
        };
      } else {
        // Existing logic for non-empty playlists
        const artistCounts: { [artist: string]: number } = {};
        tracks.items.forEach((item: any) => {
          if (item.track && item.track.artists.length > 0) {
            const mainArtist = item.track.artists[0].name;
            artistCounts[mainArtist] = (artistCounts[mainArtist] || 0) + 1;
          }
        });

        const featuredArtist = Object.keys(artistCounts).reduce((a, b) => 
          artistCounts[a] > artistCounts[b] ? a : b
        );

        const artistInfo = await this.spotify.artists.get(tracks.items[0].track.artists[0].id);

        this.spotlightArtists[playlistId] = {
          name: playlist.name,
          artist: featuredArtist,
          image: artistInfo.images[0]?.url || ''
        };
      }
    }
  }

  toggleEditSpotlight(playlistId: string) {
    this.editingSpotlight = this.editingSpotlight === playlistId ? null : playlistId;
    this.spotlightSearchResults[playlistId] = [];
    this.selectedArtistForSpotlight = null;
  }

  searchSpotlightArtist(playlistId: string, query: string) {
    const lowercaseQuery = query.toLowerCase();
    const uniqueArtists = new Set<string>();
    
    const sourcePlaylistIds = [
      '5yeiIBl8YttUOvfvs0kXNs',
      '1HgIJqYLqxKhgrw5jXALrb',
      '0UWQxGY3dNsUTdlDJcMJH2',
    ];

    const sourcePlaylists = this.playlists.filter(playlist => sourcePlaylistIds.includes(playlist.id));
    
    this.allSongs.forEach(song => {
      if (song.artists.toLowerCase().includes(lowercaseQuery) && 
          song.playlists.some(playlistName => sourcePlaylists.some(p => p.name === playlistName))) {
        uniqueArtists.add(song.artists.split(', ')[0]);
      }
    });

    this.spotlightSearchResults[playlistId] = Array.from(uniqueArtists).map(artist => ({ name: artist }));
  }
  async updateSpotlightArtist(playlistId: string, artistName: string) {
    if (!this.spotify) {
      console.error('Spotify API not initialized');
      return;
    }

    const sourcePlaylistIds = [
      '5yeiIBl8YttUOvfvs0kXNs',
      '1HgIJqYLqxKhgrw5jXALrb',
      '0UWQxGY3dNsUTdlDJcMJH2',
    ];

    let artistSongs: Song[] = [];

    // Fetch songs from each source playlist
    for (const sourcePlaylistId of sourcePlaylistIds) {
      const playlistTracks = await this.spotify.playlists.getPlaylistItems(sourcePlaylistId);
      const playlistArtistSongs = playlistTracks.items
        .filter(item => item.track && item.track.artists[0].name === artistName)
        .map(item => ({
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists.map(artist => artist.name).join(', '),
          playlists: [this.playlists.find(p => p.id === sourcePlaylistId)?.name || ''],
          albumCover: item.track.album.images[0]?.url || ''
        }));
      artistSongs = [...artistSongs, ...playlistArtistSongs];
    }

    const playlist = this.playlists.find(p => p.id === playlistId);

    if (!playlist) {
      console.error('Playlist not found');
      return;
    }

    await this.spotify.playlists.updatePlaylistItems(playlistId, { uris: [] });

    const trackUris = artistSongs.map(song => `spotify:track:${song.id}`);
    await this.spotify.playlists.addItemsToPlaylist(playlistId, trackUris);

    // Update local allSongs array
    this.allSongs.forEach(song => {
      const songIndex = song.playlists.indexOf(playlist.name);
      if (songIndex !== -1) {
        song.playlists.splice(songIndex, 1);
      }
    });

    artistSongs.forEach(song => {
      if (!song.playlists.includes(playlist.name)) {
        song.playlists.push(playlist.name);
      }
    });

    this.spotlightArtists[playlistId] = {
      name: `Spotlight: ${artistName}`,
      artist: artistName,
      image: artistSongs[0]?.albumCover || ''
    };

    this.editingSpotlight = null;
    this.spotlightSearchResults[playlistId] = [];
    this.selectedArtistForSpotlight = null;

    // Update search results if any
    if (this.searchResults.length > 0) {
      this.searchResults = this.searchResults.map(song => ({
        ...song,
        playlists: this.allSongs.find(s => s.id === song.id)?.playlists || []
      }));
    }
  }
  cancelEditSpotlight() {
    this.editingSpotlight = null;
    this.spotlightSearchResults = {};
    this.selectedArtistForSpotlight = null;
  }

  selectArtistForConfirmation(artistName: string) {
    this.selectedArtistForSpotlight = artistName;
  }

  confirmSpotlightArtistUpdate() {
    if (this.editingSpotlight && this.selectedArtistForSpotlight) {
      this.updateSpotlightArtist(this.editingSpotlight, this.selectedArtistForSpotlight);
    }
  }

  private clearErrorMessage() {
    setTimeout(() => {
      this.errorMessage = null;
    }, 5000);
  }
}
