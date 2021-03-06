module Scuffle {
	export class Instance {
		game : ServerGame
		id : number
		map : Map
		clients : { [k : number] : Client }
		bullets : { [k : number] : Bullet }

		constructor(game : ServerGame, id : number) {
			this.game = game
			this.id = id
			this.clients = {}
			this.bullets = {}
		}

		firstAvailablePlayerID() {
			for(var id=0; this.clients[id]!==undefined; ++id) {}
			return id
		}

		firstAvailableBulletID() {
			for(var id=0; this.bullets[id]!==undefined; ++id) {}
			return id
		}

		forEachClient(fn : Function) {
			for(var k in this.clients)
				if(fn(this.clients[k], k, this.clients) === false)
					return false
			return true
		}

		forEachPlayer(fn : Function) {
			for(var k in this.clients)
				if(fn(this.clients[k].player, k, this.clients) === false)
					return false
			return true
		}

		forEachBullet(fn : Function) {
			for(var k in this.bullets)
				if(fn(this.bullets[k], k, this.bullets) === false)
					return false
			return true
		}

		newPlayer(client : Client) {
			var id = this.firstAvailablePlayerID()
			this.clients[id] = client
			this.clients[id].player = new Player(id)
			var colors = [
				0xff0000,
				0xff8800,
				0xffff00,
				0x00ff00,
				0x55aaff,
				0xff00ff,
				0x5500ff
			]
			this.clients[id].player.color = colors[id] || 0xffffff
			return this.clients[id].player
		}

		removePlayer(id : number) {
			delete this.clients[id]
		}

		newBullet(owner : number) {
			var id = this.firstAvailableBulletID()
			return (this.bullets[id] = Bullet.create(id, owner))
		}

		removeBullet(id : number) {
			this.forEachClient((cli : Client) => {
				cli.batch.push(Protocol.Server.InstanceBulletRemove, [id])
			})
			this.bullets[id].pool()
			delete this.bullets[id]
		}

		spawn(id : number) {
			if(this.clients[id]) {
				var spawnIndex = Math.floor(Math.random() * this.map.spawns.length)
				this.clients[id].player.pos.setToPoint(this.map.spawns[spawnIndex])
				this.clients[id].player.health = this.clients[id].player.baseHealth
				this.game.io.sockets.in(this.id).emit(Protocol.Server.InstancePlayerSpawn, this.clients[id].player.compress(3))
			}
		}

		kill(id : number, idKiller : number) {
			++this.clients[idKiller].player.kills
			++this.clients[idKiller].player.streak
			++this.clients[id].player.deaths
			this.clients[id].player.streak = 0
			this.game.io.sockets.in(this.id).emit(Protocol.Server.InstancePlayerKill, id, idKiller)
		}

		respawn(id : number, idKiller : number) {
			this.kill(id, idKiller)
			setTimeout(() => { this.spawn(id) }, 2000)
		}

		accum_bullet : number = 0
		tick(time : number) {
			this.forEachClient((client : Client) => {
				client.tick(time)
			})

			this.accum_bullet += time
			var timestep = 10
			while(this.accum_bullet >= timestep) {
				this.forEachBullet((bullet : Bullet, id : number) => {
					var vTmp = bullet.velocity.scaledBy(timestep).scaledBy(bullet.dilation)
					var newPos = bullet.pos.addedToPoint(vTmp)
					vTmp.pool()

					bullet.dilation *= 0.985
					if(bullet.dilation < 0.3) bullet.dilation = 0.2
					this.game.io.sockets.in(this.id).emit(Protocol.Server.InstanceBulletDilate, id, bullet.dilation)

					var hitsWall = this.map.lines.some((ln : Line) => {
						return Line.prototype.intersectsMovingCircleOf.call(ln, bullet.pos, newPos, bullet.radius)
					})
					if(hitsWall)
						this.removeBullet(id)
					else {
						var hitsPlayer = false
						for(var idPl in this.clients) {
							var pl = this.clients[idPl].player
							// != used to coerce string and number
							if(idPl != bullet.owner && pl.isAlive())
								if(movingCirclesIntersect(bullet.pos, newPos, bullet.radius, pl.pos, pl.radius)) {
									pl.health -= bullet.damage
									this.game.io.sockets.in(this.id).emit(Protocol.Server.InstancePlayerHurt, idPl, pl.health)
									if(!pl.isAlive())
										this.respawn(idPl, bullet.owner)
									this.removeBullet(id)
									hitsPlayer = true
									break
								}
						}

						if(!hitsPlayer) {
							bullet.pos.pool()
							bullet.pos = newPos
						}
						else
							newPos.pool()
					}
				})
				this.accum_bullet -= timestep
			}
		}
	}
}
