const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database.sqlite');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Token de acesso necessário' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sua_chave_secreta');
    req.usuario = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
};

const getUsuarioById = (id) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT id, nome, email FROM usuarios WHERE id = ?', [id], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = { auth, getUsuarioById }; 