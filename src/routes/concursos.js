const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../../database.sqlite');

// Listar concursos do usuário
router.get('/', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT * FROM concursos WHERE usuario_id = ? ORDER BY created_at DESC', 
    [req.usuario.id], (err, concursos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar concursos' });
    }
    
    res.json(concursos);
  });
});

// Buscar concurso por ID
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get('SELECT * FROM concursos WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], (err, concurso) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar concurso' });
    }
    
    if (!concurso) {
      return res.status(404).json({ message: 'Concurso não encontrado' });
    }
    
    res.json(concurso);
  });
});

// Criar novo concurso
router.post('/', auth, [
  body('nome').notEmpty().withMessage('Nome do concurso é obrigatório'),
  body('cargo').optional()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, cargo } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('INSERT INTO concursos (nome, cargo, usuario_id) VALUES (?, ?, ?)', 
      [nome, cargo, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao criar concurso' });
      }
      
      res.status(201).json({
        message: 'Concurso criado com sucesso',
        concurso: {
          id: this.lastID,
          nome,
          cargo,
          usuario_id: req.usuario.id
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar concurso
router.put('/:id', auth, [
  body('nome').notEmpty().withMessage('Nome do concurso é obrigatório'),
  body('cargo').optional()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, cargo } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE concursos SET nome = ?, cargo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
      [nome, cargo, req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar concurso' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Concurso não encontrado' });
      }
      
      res.json({
        message: 'Concurso atualizado com sucesso',
        concurso: { id: req.params.id, nome, cargo }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir concurso
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM concursos WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao excluir concurso' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Concurso não encontrado' });
    }
    
    res.json({ message: 'Concurso excluído com sucesso' });
  });
});

// Buscar concursos com estatísticas
router.get('/:id/estatisticas', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      c.*,
      COUNT(DISTINCT m.id) as total_materias,
      COUNT(DISTINCT a.id) as total_assuntos,
      COUNT(DISTINCT e.id) as total_estudos,
      SUM(e.duracao) as tempo_total_estudo
    FROM concursos c
    LEFT JOIN materias m ON m.usuario_id = c.usuario_id
    LEFT JOIN assuntos a ON a.materia_id = m.id
    LEFT JOIN estudos e ON e.assunto_id = a.id AND e.usuario_id = c.usuario_id
    WHERE c.id = ? AND c.usuario_id = ?
    GROUP BY c.id
  `;
  
  db.get(query, [req.params.id, req.usuario.id], (err, estatisticas) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
    
    if (!estatisticas) {
      return res.status(404).json({ message: 'Concurso não encontrado' });
    }
    
    res.json(estatisticas);
  });
});

module.exports = router; 