export class MidiIO {
  constructor() {
    this.midi = null;
    this.inputs = [];
    this.outputs = [];
    this.selectedInput = null;
    this.onMessage = () => {};
    this.onStateChange = () => {};
    this.available = false;
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      this.available = false;
      return false;
    }
    this.midi = await navigator.requestMIDIAccess({ sysex: false });
    this._refresh();
    this.midi.onstatechange = () => this._refresh();
    this.available = true;
    return true;
  }

  _refresh() {
    this.inputs = Array.from(this.midi.inputs.values());
    this.outputs = Array.from(this.midi.outputs.values());
    if (this.selectedInput && !this.inputs.includes(this.selectedInput)) {
      this.selectedInput = null;
    }
    for (const input of this.inputs) {
      input.onmidimessage = (e) => this.onMessage(Array.from(e.data), input);
    }
    this.onStateChange();
  }

  selectInput(id) {
    this.selectedInput = this.inputs.find((i) => i.id === id) || null;
    this.onStateChange();
  }

  send(data, output, when = 0) {
    const out = output || this.outputs[0];
    if (!out) return false;
    out.send(data, when > 0 ? when : undefined);
    return true;
  }
}
