const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Listar metas do usuário
router.get('/', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT m.*, c.nome as concurso_nome
    FROM metas m
    LEFT JOIN concursos c ON m.concurso_id = c.id
    WHERE m.usuario_id = ?
    ORDER BY m.created_at DESC
  `;
  
  db.all(query, [req.usuario.id], (err, metas) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar metas' });
    }
    
    res.json(metas);
  });
});

// Buscar meta por ID com detalhes
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  // Buscar meta
  db.get('SELECT * FROM metas WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], (err, meta) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar meta' });
    }
    
    if (!meta) {
      db.close();
      return res.status(404).json({ message: 'Meta não encontrada' });
    }
    
    // Buscar metas por matéria
    db.all('SELECT mm.*, m.nome as materia_nome FROM metas_materias mm JOIN materias m ON mm.materia_id = m.id WHERE mm.meta_id = ?', 
      [req.params.id], (err, metas_materias) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao buscar metas por matéria' });
      }
      
      // Buscar metas por assunto
      db.all('SELECT ma.*, a.nome as assunto_nome, m.nome as materia_nome FROM metas_assuntos ma JOIN assuntos a ON ma.assunto_id = a.id JOIN materias m ON a.materia_id = m.id WHERE ma.meta_id = ?', 
        [req.params.id], (err, metas_assuntos) => {
        db.close();
        
        if (err) {
          return res.status(500).json({ message: 'Erro ao buscar metas por assunto' });
        }
        
        res.json({
          ...meta,
          metas_materias,
          metas_assuntos
        });
      });
    });
  });
});

// Criar nova meta
router.post('/', auth, [
  body('titulo').notEmpty().withMessage('Título da meta é obrigatório'),
  body('descricao').optional(),
  body('tipo').isIn(['geral', 'concurso']).withMessage('Tipo deve ser "geral" ou "concurso"'),
  body('carga_horaria_total').optional().isInt().withMessage('Carga horária total deve ser um número'),
  body('carga_horaria_diaria').optional().isInt().withMessage('Carga horária diária deve ser um número'),
  body('data_inicio').optional().isISO8601().withMessage('Data de início inválida'),
  body('data_fim').optional().isISO8601().withMessage('Data de fim inválida'),
  body('concurso_id').optional().isInt().withMessage('ID do concurso deve ser um número'),
  body('metas_materias').optional().isArray().withMessage('Metas por matéria deve ser um array'),
  body('metas_assuntos').optional().isArray().withMessage('Metas por assunto deve ser um array')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      titulo, descricao, tipo, carga_horaria_total, carga_horaria_diaria, 
      data_inicio, data_fim, concurso_id, metas_materias, metas_assuntos 
    } = req.body;
    
    const db = new sqlite3.Database(dbPath);
    
    // Verificar se o concurso pertence ao usuário (se fornecido)
    if (concurso_id) {
      db.get('SELECT id FROM concursos WHERE id = ? AND usuario_id = ?', 
        [concurso_id, req.usuario.id], (err, concurso) => {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao verificar concurso' });
        }
        
        if (!concurso) {
          db.close();
          return res.status(404).json({ message: 'Concurso não encontrado' });
        }
        
        criarMeta();
      });
    } else {
      criarMeta();
    }
    
    function criarMeta() {
      db.run('INSERT INTO metas (titulo, descricao, tipo, carga_horaria_total, carga_horaria_diaria, data_inicio, data_fim, usuario_id, concurso_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [titulo, descricao, tipo, carga_horaria_total, carga_horaria_diaria, data_inicio, data_fim, req.usuario.id, concurso_id], function(err) {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao criar meta' });
        }
        
        const metaId = this.lastID;
        
        // Inserir metas por matéria
        if (metas_materias && metas_materias.length > 0) {
          metas_materias.forEach(meta_materia => {
            db.run('INSERT INTO metas_materias (meta_id, materia_id, carga_horaria) VALUES (?, ?, ?)', 
              [metaId, meta_materia.materia_id, meta_materia.carga_horaria]);
          });
        }
        
        // Inserir metas por assunto
        if (metas_assuntos && metas_assuntos.length > 0) {
          metas_assuntos.forEach(meta_assunto => {
            db.run('INSERT INTO metas_assuntos (meta_id, assunto_id, carga_horaria) VALUES (?, ?, ?)', 
              [metaId, meta_assunto.assunto_id, meta_assunto.carga_horaria]);
          });
        }
        
        db.close();
        
        res.status(201).json({
          message: 'Meta criada com sucesso',
          meta: {
            id: metaId,
            titulo,
            descricao,
            tipo,
            carga_horaria_total,
            carga_horaria_diaria,
            data_inicio,
            data_fim,
            usuario_id: req.usuario.id,
            concurso_id
          }
        });
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar meta
router.put('/:id', auth, [
  body('titulo').notEmpty().withMessage('Título da meta é obrigatório'),
  body('descricao').optional(),
  body('status').optional().isIn(['pendente', 'em_andamento', 'concluida']).withMessage('Status inválido'),
  body('carga_horaria_total').optional().isInt().withMessage('Carga horária total deve ser um número'),
  body('carga_horaria_diaria').optional().isInt().withMessage('Carga horária diária deve ser um número'),
  body('data_inicio').optional().isISO8601().withMessage('Data de início inválida'),
  body('data_fim').optional().isISO8601().withMessage('Data de fim inválida')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { titulo, descricao, status, carga_horaria_total, carga_horaria_diaria, data_inicio, data_fim } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE metas SET titulo = ?, descricao = ?, status = ?, carga_horaria_total = ?, carga_horaria_diaria = ?, data_inicio = ?, data_fim = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
      [titulo, descricao, status, carga_horaria_total, carga_horaria_diaria, data_inicio, data_fim, req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar meta' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Meta não encontrada' });
      }
      
      res.json({
        message: 'Meta atualizada com sucesso',
        meta: { id: req.params.id, titulo, descricao, status, carga_horaria_total, carga_horaria_diaria, data_inicio, data_fim }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir meta
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM metas WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao excluir meta' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Meta não encontrada' });
    }
    
    res.json({ message: 'Meta excluída com sucesso' });
  });
});

// Marcar meta como concluída
router.patch('/:id/concluir', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('UPDATE metas SET status = "concluida", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao concluir meta' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Meta não encontrada' });
    }
    
    res.json({ message: 'Meta marcada como concluída' });
  });
});

// Buscar progresso da meta
router.get('/:id/progresso', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      m.*,
      COALESCE(SUM(e.duracao), 0) as tempo_estudado,
      COALESCE(m.carga_horaria_total, 0) as tempo_meta,
      CASE 
        WHEN m.carga_horaria_total > 0 
        THEN ROUND((COALESCE(SUM(e.duracao), 0) * 100.0 / m.carga_horaria_total), 2)
        ELSE 0 
      END as percentual_concluido
    FROM metas m
    LEFT JOIN metas_materias mm ON m.id = mm.meta_id
    LEFT JOIN estudos e ON e.materia_id = mm.materia_id AND e.usuario_id = m.usuario_id
    WHERE m.id = ? AND m.usuario_id = ?
    GROUP BY m.id
  `;
  
  db.get(query, [req.params.id, req.usuario.id], (err, progresso) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar progresso' });
    }
    
    if (!progresso) {
      return res.status(404).json({ message: 'Meta não encontrada' });
    }
    
    res.json(progresso);
  });
});

module.exports = router; 