'use strict';

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'cleaner_session';
const TOKEN_TTL = '12h';

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
};

const isProduction = () => process.env.NODE_ENV === 'production';

function issueSession(res, operator) {
  const token = jwt.sign({ sub: operator.id, email: operator.email }, secret(), {
    expiresIn: TOKEN_TTL,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
  });
}

function requireOperator(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.operator = jwt.verify(token, secret());
    return next();
  } catch {
    clearSession(res);
    return res.status(401).json({ error: 'Session expired' });
  }
}

module.exports = { COOKIE_NAME, issueSession, clearSession, requireOperator };
