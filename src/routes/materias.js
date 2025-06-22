const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Listar matérias do usuário
router.get('/', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT * FROM materias WHERE usuario_id = ? ORDER BY ordem, nome', 
    [req.usuario.id], (err, materias) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar matérias' });
    }
    
    res.json(materias);
  });
});

// Buscar matéria por ID com assuntos
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get('SELECT * FROM materias WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], (err, materia) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar matéria' });
    }
    
    if (!materia) {
      db.close();
      return res.status(404).json({ message: 'Matéria não encontrada' });
    }
    
    // Buscar assuntos da matéria
    db.all('SELECT * FROM assuntos WHERE materia_id = ? ORDER BY ordem, nome', 
      [req.params.id], (err, assuntos) => {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar assuntos' });
      }
      
      res.json({
        ...materia,
        assuntos
      });
    });
  });
});

// Criar nova matéria
router.post('/', auth, [
  body('nome').notEmpty().withMessage('Nome da matéria é obrigatório'),
  body('descricao').optional(),
  body('ordem').optional().isInt().withMessage('Ordem deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, descricao, ordem } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('INSERT INTO materias (nome, descricao, ordem, usuario_id) VALUES (?, ?, ?, ?)', 
      [nome, descricao, ordem || 0, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao criar matéria' });
      }
      
      res.status(201).json({
        message: 'Matéria criada com sucesso',
        materia: {
          id: this.lastID,
          nome,
          descricao,
          ordem: ordem || 0,
          usuario_id: req.usuario.id
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar matéria
router.put('/:id', auth, [
  body('nome').notEmpty().withMessage('Nome da matéria é obrigatório'),
  body('descricao').optional(),
  body('ordem').optional().isInt().withMessage('Ordem deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, descricao, ordem } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE materias SET nome = ?, descricao = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
      [nome, descricao, ordem || 0, req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar matéria' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Matéria não encontrada' });
      }
      
      res.json({
        message: 'Matéria atualizada com sucesso',
        materia: { id: req.params.id, nome, descricao, ordem: ordem || 0 }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir matéria
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM materias WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao excluir matéria' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Matéria não encontrada' });
    }
    
    res.json({ message: 'Matéria excluída com sucesso' });
  });
});

// Reordenar matérias
router.post('/reordenar', auth, [
  body('materias').isArray().withMessage('Lista de matérias é obrigatória')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { materias } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.serialize(() => {
      materias.forEach((materia, index) => {
        db.run('UPDATE materias SET ordem = ? WHERE id = ? AND usuario_id = ?', 
          [index, materia.id, req.usuario.id]);
      });
    });
    
    db.close();
    res.json({ message: 'Matérias reordenadas com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// ===== ROTAS PARA ASSUNTOS =====

// Listar assuntos de uma matéria
router.get('/:materiaId/assuntos', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT * FROM assuntos WHERE materia_id = ? ORDER BY ordem, nome', 
    [req.params.materiaId], (err, assuntos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar assuntos' });
    }
    
    res.json(assuntos);
  });
});

// Criar novo assunto
router.post('/:materiaId/assuntos', auth, [
  body('nome').notEmpty().withMessage('Nome do assunto é obrigatório'),
  body('descricao').optional(),
  body('ordem').optional().isInt().withMessage('Ordem deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, descricao, ordem } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar se a matéria pertence ao usuário
    db.get('SELECT id FROM materias WHERE id = ? AND usuario_id = ?', 
      [req.params.materiaId, req.usuario.id], (err, materia) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao verificar matéria' });
      }
      
      if (!materia) {
        db.close();
        return res.status(404).json({ message: 'Matéria não encontrada' });
      }
      
      // Criar assunto
      db.run('INSERT INTO assuntos (nome, descricao, ordem, materia_id) VALUES (?, ?, ?, ?)', 
        [nome, descricao, ordem || 0, req.params.materiaId], function(err) {
        db.close();
        
        if (err) {
          return res.status(500).json({ message: 'Erro ao criar assunto' });
        }
        
        res.status(201).json({
          message: 'Assunto criado com sucesso',
          assunto: {
            id: this.lastID,
            nome,
            descricao,
            ordem: ordem || 0,
            materia_id: req.params.materiaId
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar assunto
router.put('/:materiaId/assuntos/:assuntoId', auth, [
  body('nome').notEmpty().withMessage('Nome do assunto é obrigatório'),
  body('descricao').optional(),
  body('ordem').optional().isInt().withMessage('Ordem deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nome, descricao, ordem } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE assuntos SET nome = ?, descricao = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND materia_id = ?', 
      [nome, descricao, ordem || 0, req.params.assuntoId, req.params.materiaId], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar assunto' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Assunto não encontrado' });
      }
      
      res.json({
        message: 'Assunto atualizado com sucesso',
        assunto: { id: req.params.assuntoId, nome, descricao, ordem: ordem || 0 }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir assunto
router.delete('/:materiaId/assuntos/:assuntoId', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM assuntos WHERE id = ? AND materia_id = ?', 
    [req.params.assuntoId, req.params.materiaId], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao excluir assunto' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Assunto não encontrado' });
    }
    
    res.json({ message: 'Assunto excluído com sucesso' });
  });
});

module.exports = router; 