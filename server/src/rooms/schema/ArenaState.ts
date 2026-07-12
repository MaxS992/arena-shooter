import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") vz = 0;
  @type("number") yaw = 0;
  @type("number") pitch = 0;
  @type("string") movementState: string = "grounded";
  @type("number") health = 100;
  @type("number") maxHealth = 100;
  @type("string") currentWeapon = "rifle";
  @type("number") ammo = 30;
  @type("number") maxAmmo = 30;
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("boolean") alive = true;
  @type("number") respawnTimer = 0;
  @type("boolean") shooting = false;
}

export class KillEvent extends Schema {
  @type("string") killer = "";
  @type("string") victim = "";
  @type("string") weapon = "";
  @type("number") time = 0;
}

export class ArenaState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([KillEvent]) killFeed = new ArraySchema<KillEvent>();
  @type("number") gameTime = 0;
}
