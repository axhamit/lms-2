const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jitsi } = require('../config/env');
const { endTime } = require('./sessions');

exports.newRoom = () => 'lms-' + crypto.randomBytes(10).toString('hex');

// Returns what the frontend needs to open the embedded Jitsi room
exports.joinInfo = (session, user, moderator) => {
  if (jitsi.appId && jitsi.kid && jitsi.privateKey) {          // 8x8 JaaS (managed Jitsi) with signed JWT
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({
      aud: 'jitsi', iss: 'chat', sub: jitsi.appId, room: '*', nbf: now - 10,
      exp: Math.floor(+endTime(session) / 1000) + 3600,
      context: { user: { id: String(user._id), name: user.name, email: user.email, moderator: String(!!moderator) }, features: { recording: 'false', livestreaming: 'false' } },
    }, jitsi.privateKey, { algorithm: 'RS256', header: { alg: 'RS256', kid: jitsi.kid, typ: 'JWT' } });
    return { domain: '8x8.vc', roomName: `${jitsi.appId}/${session.roomName}`, jwt: token };
  }
  return { domain: jitsi.domain, roomName: session.roomName, jwt: null };   // public / self-hosted Jitsi
};
