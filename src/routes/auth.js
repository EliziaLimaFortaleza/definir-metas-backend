const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Registro de usuário
router.post('/registro', [
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, email, senha } = req.body;
    const db = new sqlite3.Database(dbPath);

    // Verificar se email já existe
    db.get('SELECT id FROM usuarios WHERE email = ?', [email], async (err, row) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (row) {
        db.close();
        return res.status(400).json({ message: 'Email já cadastrado' });
      }

      // Hash da senha
      const senhaHash = await bcrypt.hash(senha, 10);

      // Inserir usuário
      db.run('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', 
        [nome, email, senhaHash], function(err) {
        db.close();
        
        if (err) {
          return res.status(500).json({ message: 'Erro ao criar usuário' });
        }

        // Gerar token
        const token = jwt.sign(
          { id: this.lastID, nome, email },
          process.env.JWT_SECRET || 'sua_chave_secreta',
          { expiresIn: '7d' }
        );

        res.status(201).json({
          message: 'Usuário criado com sucesso',
          token,
          usuario: { id: this.lastID, nome, email }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Login de usuário
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, senha } = req.body;
    const db = new sqlite3.Database(dbPath);

    db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
      db.close();

      if (err) {
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (!usuario) {
        return res.status(401).json({ message: 'Email ou senha inválidos' });
      }

      // Verificar senha
      const senhaValida = await bcrypt.compare(senha, usuario.senha);
      if (!senhaValida) {
        return res.status(401).json({ message: 'Email ou senha inválidos' });
      }

      // Gerar token
      const token = jwt.sign(
        { id: usuario.id, nome: usuario.nome, email: usuario.email },
        process.env.JWT_SECRET || 'sua_chave_secreta',
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Login realizado com sucesso',
        token,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Verificar token
router.get('/verificar', (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sua_chave_secreta');
    res.json({ valid: true, usuario: decoded });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

module.exports = router; 