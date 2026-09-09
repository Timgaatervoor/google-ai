import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Fase 1: Safe Deletion Confirmation Logic', () => {
  class SafeActionStateTracker {
    public isArmed = false;
    public isHolding = false;
    public progressPercent = 0;
    public executedCount = 0;
    public requireDialog = false;
    public dialogInput = '';
    public HOLD_DURATION_MS = 3000;
    private holdStartTime: number | null = null;

    arm() {
      this.isArmed = true;
      this.progressPercent = 0;
    }

    startHold(now: number) {
      if (!this.isArmed) return;
      this.isHolding = true;
      this.holdStartTime = now;
      this.progressPercent = 0;
    }

    updateHold(now: number): boolean {
      if (!this.isHolding || this.holdStartTime === null) return false;
      const elapsed = now - this.holdStartTime;
      this.progressPercent = Math.min(100, (elapsed / this.HOLD_DURATION_MS) * 100);

      if (elapsed >= this.HOLD_DURATION_MS) {
        this.isHolding = false;
        this.holdStartTime = null;
        if (!this.requireDialog) {
          this.executedCount++;
          this.isArmed = false;
        }
        return true;
      }
      return false;
    }

    cancelHold() {
      this.isHolding = false;
      this.holdStartTime = null;
      this.progressPercent = 0;
    }

    triggerConfirm() {
      if (!this.isArmed) return;
      this.isHolding = false;
      this.holdStartTime = null;
      if (!this.requireDialog) {
        this.executedCount++;
        this.isArmed = false;
      }
    }

    confirmDialog(input: string): boolean {
      if (input.trim().toUpperCase() === 'BEVESTIG') {
        this.executedCount++;
        this.isArmed = false;
        return true;
      }
      return false;
    }
  }

  it('short click alone arms the button but does NOT delete or reset any data', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();

    assert.equal(tracker.isArmed, true);
    assert.equal(tracker.executedCount, 0, 'No action should be executed on click');
  });

  it('holding for 1.0 second and releasing cancels without executing', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();
    tracker.startHold(1000);
    tracker.updateHold(2000); // 1.0s elapsed

    assert.equal(tracker.executedCount, 0);
    assert.ok(tracker.progressPercent > 30 && tracker.progressPercent < 35);

    tracker.cancelHold(); // User released touch/mouse before 3s
    assert.equal(tracker.isHolding, false);
    assert.equal(tracker.executedCount, 0, 'Must not execute if released before 3s');
  });

  it('holding for 2.9 seconds and releasing cancels without executing', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();
    tracker.startHold(1000);
    tracker.updateHold(3900); // 2.9s elapsed

    assert.equal(tracker.executedCount, 0);
    assert.ok(tracker.progressPercent >= 96 && tracker.progressPercent < 100);

    tracker.cancelHold();
    assert.equal(tracker.executedCount, 0, '2.9s is insufficient: must require full 3.0s');
  });

  it('holding for full 3.0 seconds triggers the action exactly once', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();
    tracker.startHold(1000);
    const completed = tracker.updateHold(4000); // 3.0s elapsed

    assert.equal(completed, true);
    assert.equal(tracker.executedCount, 1, 'Action must be executed once after full 3s');
    assert.equal(tracker.isArmed, false);
  });

  it('double clicking or repeated triggers cannot cause double execution', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();
    tracker.startHold(1000);
    tracker.updateHold(4000); // executed once

    // Try triggering again while already completed
    tracker.updateHold(4100);
    tracker.updateHold(5000);
    assert.equal(tracker.executedCount, 1, 'Prevent double execution');
  });

  it('full database reset requires dialog with BEVESTIG after 3-second hold', () => {
    const tracker = new SafeActionStateTracker();
    tracker.requireDialog = true;
    tracker.arm();
    tracker.startHold(1000);
    const holdDone = tracker.updateHold(4000);

    assert.equal(holdDone, true);
    assert.equal(tracker.executedCount, 0, 'Action not executed yet; requires dialog confirmation');

    // Wrong text entered
    const wrongAttempt = tracker.confirmDialog('ja');
    assert.equal(wrongAttempt, false);
    assert.equal(tracker.executedCount, 0);

    // Correct BEVESTIG entered
    const rightAttempt = tracker.confirmDialog('BEVESTIG');
    assert.equal(rightAttempt, true);
    assert.equal(tracker.executedCount, 1);
  });

  it('second click while armed immediately confirms and executes', () => {
    const tracker = new SafeActionStateTracker();
    tracker.arm();
    assert.equal(tracker.isArmed, true);
    assert.equal(tracker.executedCount, 0);

    // Second click occurs
    tracker.triggerConfirm();
    assert.equal(tracker.executedCount, 1, 'Second click while armed executes action');
    assert.equal(tracker.isArmed, false, 'Disarms button after execution');
  });
});
