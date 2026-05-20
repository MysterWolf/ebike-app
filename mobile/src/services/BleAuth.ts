import { Buffer } from 'buffer';
import { encryptionStringOfValue } from './BleEncryption';

// ============================================================
// BleAuth.ts — V70 mutual authentication state machine
//
// Protocol (< = app→device on A1,  > = device→app on A4):
//   App  → A1: +VER?
//   V70  → A4: +VER=<info>
//   App  → A1: +PM?
//   V70  → A4: +PM><6-byte-hex-nonce>     V70 challenges app
//   App  → A1: +PM<<4-byte-hex-hash>      app responds
//   V70  → A4: +PM=OK  |  +PM=NK
//   App  → A1: +PA<<6-byte-hex-nonce>     app challenges V70
//   V70  → A4: +PA><4-byte-hex-hash>      V70 responds
//   App  → A1: CODE=000000  (200ms delay) password auth step
//   V70  → A4: CODE_OK                    V70 confirms password
//   App  → A1: GETDEVID                   triggers binary telemetry
//
// ADDITIVE DESIGN: handlePacket() is purely side-effectful.
// It never signals "consumed". The caller ALWAYS routes
// every packet through decodeNotify2() regardless of auth state.
// ============================================================

export type AuthStep =
  | 'idle'
  | 'wait_ver'
  | 'wait_pm_challenge'
  | 'wait_pm_result'
  | 'wait_pa_response'
  | 'wait_code_ok'
  | 'authenticated'
  | 'failed';

export type WriteFunc = (data: string) => Promise<void>;
export type LogFunc   = (msg: string) => void;

export class BleAuth {
  private step: AuthStep = 'idle';
  private paChallenge: string | null = null; // hex nonce we sent in +PA<

  // Call once after notifications are registered and 500ms has elapsed.
  start(write: WriteFunc, log: LogFunc): void {
    this.step = 'wait_ver';
    this.paChallenge = null;
    log('AUTH: start — sending +VER?');
    write('+VER?').catch((e: any) => log(`AUTH ERROR write +VER?: ${e?.message}`));
  }

  // Feed every ASCII packet from A4 into the state machine.
  // Returns void — never consumes. Caller must always also call decodeNotify2().
  handlePacket(raw: string, write: WriteFunc, log: LogFunc): void {
    // Nothing to do once auth is terminal — avoids log spam from +LOCK=, +MODE= etc.
    if (this.step === 'idle' || this.step === 'authenticated' || this.step === 'failed') return;
    log(`AUTH handlePacket step=${this.step} raw=${raw}`);

    if (this.step === 'wait_ver' && raw.startsWith('+VER=')) {
      log(`AUTH: +VER= received (${raw}) — requesting PM challenge`);
      this.step = 'wait_pm_challenge';
      write('+PM?').catch((e: any) => log(`AUTH ERROR write +PM?: ${e?.message}`));
      return;
    }

    if (this.step === 'wait_pm_challenge' && raw.startsWith('+PM>')) {
      const hexNonce = raw.slice(4).trim();
      const hash     = encryptionStringOfValue(hexNonce);
      const reply    = '+PM<' + hash;
      log(`AUTH: PM challenge nonce=${hexNonce} → response=${reply}`);
      this.step = 'wait_pm_result';
      write(reply).catch((e: any) => log(`AUTH ERROR write +PM<: ${e?.message}`));
      return;
    }

    if (this.step === 'wait_pm_result' && raw.startsWith('+PM>')) {
      if (raw.includes('OK')) {
        const nonceBytes = Buffer.alloc(6);
        for (let i = 0; i < 6; i++) nonceBytes[i] = Math.floor(Math.random() * 256);
        this.paChallenge = nonceBytes.toString('hex').toUpperCase();
        const challenge  = '+PA<' + this.paChallenge;
        log(`AUTH: PM>OK — sending PA challenge ${challenge}`);
        this.step = 'wait_pa_response';
        write(challenge).catch((e: any) => log(`AUTH ERROR write +PA<: ${e?.message}`));
      } else {
        log(`AUTH FAILED: NK — V70 rejected our PM hash. Response: ${raw}`);
        this.step = 'failed';
      }
      return;
    }

    if (this.step === 'wait_pa_response' && (raw.startsWith('+PA>') || raw.startsWith('+PA='))) {
      const hexResp  = raw.slice(4).trim().toUpperCase();
      const expected = encryptionStringOfValue(this.paChallenge!);
      if (hexResp === expected) {
        log('AUTH: PA verified — sending CODE=000000 in 200ms');
        this.step = 'wait_code_ok';
        setTimeout(() => {
          write('CODE=000000').catch((e: any) => log(`AUTH ERROR write CODE=000000: ${e?.message}`));
          log('AUTH: Sent CODE=000000');
        }, 200);
      } else {
        log(`AUTH FAILED: PA mismatch — expected=${expected} got=${hexResp}`);
        this.step = 'failed';
      }
      return;
    }

    if (this.step === 'wait_code_ok' && raw === 'CODE_OK') {
      write('GETDEVID').catch((e: any) => log(`AUTH ERROR write GETDEVID: ${e?.message}`));
      log('AUTH: Sent GETDEVID — binary telemetry should follow');
      this.step = 'authenticated';
      return;
    }
  }

  getStep(): AuthStep        { return this.step; }
  isAuthenticated(): boolean { return this.step === 'authenticated'; }
  reset(): void              { this.step = 'idle'; this.paChallenge = null; }
}
