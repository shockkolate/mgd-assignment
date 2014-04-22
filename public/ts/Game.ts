module Scuffle {
	export class Game extends Phaser.Game {
		socket : Socket
		syncState : { [ k : string] : boolean }

		constructor() {
			super(1280, 720, Phaser.AUTO, 'content', null)
			this.syncState = {}

			this.state.add('Boot', BootState, true)
			this.state.add('Preload', PreloadState)
			this.state.add('Connect', ConnectState)
			this.state.add('Protocol', ProtocolState)
			this.state.add('Map', MapState)
		}
	}
}
