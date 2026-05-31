// log.js — one home for the console prefix. log()/warn() stamp a local
// timestamp so overnight failures are dated; PREFIX (no timestamp) is for the
// interactive console-control output, matching v1.0 formatting.

export const PREFIX = '[TCG ext]';

const stamped = () => `[TCG ext ${new Date().toLocaleString()}]`;

export const log = (...args) => console.log(stamped(), ...args);
export const warn = (...args) => console.warn(stamped(), ...args);
