export interface KillFeedEntry {
  killer: string;
  victim: string;
  weapon: string;
  time: number;
}

export class GameState {
  playerHp = 100;
  playerMaxHp = 100;
  playerKills = 0;
  playerDeaths = 0;
  playerAlive = true;
  respawnTimer = 0;
  killFeed: KillFeedEntry[] = [];
  gameTime = 0;
  private static RESPAWN_TIME = 3;
  private static KILL_FEED_DURATION = 5;

  update(dt: number): void {
    this.gameTime += dt;

    // Respawn
    if (!this.playerAlive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.playerAlive = true;
        this.playerHp = this.playerMaxHp;
      }
    }

    // Clean old kill feed entries
    this.killFeed = this.killFeed.filter(
      (e) => this.gameTime - e.time < GameState.KILL_FEED_DURATION
    );
  }

  playerTakeDamage(amount: number): boolean {
    if (!this.playerAlive) return false;
    this.playerHp = Math.max(0, this.playerHp - amount);
    if (this.playerHp <= 0) {
      this.playerAlive = false;
      this.playerDeaths++;
      this.respawnTimer = GameState.RESPAWN_TIME;
      return true; // died
    }
    return false;
  }

  addKill(killer: string, victim: string, weapon: string): void {
    this.killFeed.push({ killer, victim, weapon, time: this.gameTime });
    if (killer === "Player") this.playerKills++;
  }

  getKDA(): string {
    return `${this.playerKills} / ${this.playerDeaths}`;
  }
}
