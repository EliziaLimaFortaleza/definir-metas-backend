const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../../database.sqlite');

// Listar estudos do usuário
router.get('/', auth, (req, res) => {
  const { data_inicio, data_fim, materia_id, assunto_id } = req.query;
  const db = new sqlite3.Database(dbPath);
  
  let query = `
    SELECT e.*, m.nome as materia_nome, a.nome as assunto_nome, 
           pa.nome as proximo_assunto_nome
    FROM estudos e
    JOIN materias m ON e.materia_id = m.id
    JOIN assuntos a ON e.assunto_id = a.id
    LEFT JOIN assuntos pa ON e.proximo_assunto_id = pa.id
    WHERE e.usuario_id = ?
  `;
  
  const params = [req.usuario.id];
  
  if (data_inicio) {
    query += ' AND e.data >= ?';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND e.data <= ?';
    params.push(data_fim);
  }
  
  if (materia_id) {
    query += ' AND e.materia_id = ?';
    params.push(materia_id);
  }
  
  if (assunto_id) {
    query += ' AND e.assunto_id = ?';
    params.push(assunto_id);
  }
  
  query += ' ORDER BY e.data DESC, e.created_at DESC';
  
  db.all(query, params, (err, estudos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar estudos' });
    }
    
    res.json(estudos);
  });
});

// Buscar estudo por ID
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get(`
    SELECT e.*, m.nome as materia_nome, a.nome as assunto_nome, 
           pa.nome as proximo_assunto_nome
    FROM estudos e
    JOIN materias m ON e.materia_id = m.id
    JOIN assuntos a ON e.assunto_id = a.id
    LEFT JOIN assuntos pa ON e.proximo_assunto_id = pa.id
    WHERE e.id = ? AND e.usuario_id = ?
  `, [req.params.id, req.usuario.id], (err, estudo) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar estudo' });
    }
    
    if (!estudo) {
      return res.status(404).json({ message: 'Estudo não encontrado' });
    }
    
    res.json(estudo);
  });
});

// Registrar novo estudo
router.post('/', auth, [
  body('data').isISO8601().withMessage('Data inválida'),
  body('duracao').isInt({ min: 1 }).withMessage('Duração deve ser um número positivo'),
  body('materia_id').isInt().withMessage('ID da matéria deve ser um número'),
  body('assunto_id').isInt().withMessage('ID do assunto deve ser um número'),
  body('observacoes').optional(),
  body('proximo_assunto_id').optional().isInt().withMessage('ID do próximo assunto deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { data, duracao, materia_id, assunto_id, observacoes, proximo_assunto_id } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar se a matéria pertence ao usuário
    db.get('SELECT id FROM materias WHERE id = ? AND usuario_id = ?', 
      [materia_id, req.usuario.id], (err, materia) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao verificar matéria' });
      }
      
      if (!materia) {
        db.close();
        return res.status(404).json({ message: 'Matéria não encontrada' });
      }
      
      // Verificar se o assunto pertence à matéria
      db.get('SELECT id FROM assuntos WHERE id = ? AND materia_id = ?', 
        [assunto_id, materia_id], (err, assunto) => {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao verificar assunto' });
        }
        
        if (!assunto) {
          db.close();
          return res.status(404).json({ message: 'Assunto não encontrado' });
        }
        
        // Verificar próximo assunto (se fornecido)
        if (proximo_assunto_id) {
          db.get('SELECT id FROM assuntos WHERE id = ? AND materia_id = ?', 
            [proximo_assunto_id, materia_id], (err, proximoAssunto) => {
            if (err) {
              db.close();
              return res.status(500).json({ message: 'Erro ao verificar próximo assunto' });
            }
            
            if (!proximoAssunto) {
              db.close();
              return res.status(404).json({ message: 'Próximo assunto não encontrado' });
            }
            
            criarEstudo();
          });
        } else {
          criarEstudo();
        }
        
        function criarEstudo() {
          db.run('INSERT INTO estudos (data, duracao, observacoes, proximo_assunto_id, usuario_id, materia_id, assunto_id) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [data, duracao, observacoes, proximo_assunto_id, req.usuario.id, materia_id, assunto_id], function(err) {
            db.close();
            
            if (err) {
              return res.status(500).json({ message: 'Erro ao registrar estudo' });
            }
            
            res.status(201).json({
              message: 'Estudo registrado com sucesso',
              estudo: {
                id: this.lastID,
                data,
                duracao,
                observacoes,
                proximo_assunto_id,
                usuario_id: req.usuario.id,
                materia_id,
                assunto_id
              }
            });
          });
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar estudo
router.put('/:id', auth, [
  body('data').isISO8601().withMessage('Data inválida'),
  body('duracao').isInt({ min: 1 }).withMessage('Duração deve ser um número positivo'),
  body('observacoes').optional(),
  body('proximo_assunto_id').optional().isInt().withMessage('ID do próximo assunto deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { data, duracao, observacoes, proximo_assunto_id } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE estudos SET data = ?, duracao = ?, observacoes = ?, proximo_assunto_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
      [data, duracao, observacoes, proximo_assunto_id, req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar estudo' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Estudo não encontrado' });
      }
      
      res.json({
        message: 'Estudo atualizado com sucesso',
        estudo: { id: req.params.id, data, duracao, observacoes, proximo_assunto_id }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir estudo
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM estudos WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao excluir estudo' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Estudo não encontrado' });
    }
    
    res.json({ message: 'Estudo excluído com sucesso' });
  });
});

// Estatísticas de estudo
router.get('/estatisticas/geral', auth, (req, res) => {
  const { periodo } = req.query; // 'dia', 'semana', 'mes', 'ano'
  const db = new sqlite3.Database(dbPath);
  
  let dateFilter = '';
  switch (periodo) {
    case 'dia':
      dateFilter = "AND e.data = DATE('now')";
      break;
    case 'semana':
      dateFilter = "AND e.data >= DATE('now', '-7 days')";
      break;
    case 'mes':
      dateFilter = "AND e.data >= DATE('now', '-30 days')";
      break;
    case 'ano':
      dateFilter = "AND e.data >= DATE('now', '-365 days')";
      break;
    default:
      dateFilter = "AND e.data >= DATE('now', '-30 days')"; // padrão: último mês
  }
  
  const query = `
    SELECT 
      COUNT(*) as total_estudos,
      SUM(e.duracao) as tempo_total,
      AVG(e.duracao) as tempo_medio,
      COUNT(DISTINCT e.data) as dias_estudados,
      COUNT(DISTINCT e.materia_id) as materias_estudadas,
      COUNT(DISTINCT e.assunto_id) as assuntos_estudados
    FROM estudos e
    WHERE e.usuario_id = ? ${dateFilter}
  `;
  
  db.get(query, [req.usuario.id], (err, estatisticas) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
    
    // Buscar tempo por matéria
    const queryMaterias = `
      SELECT m.nome, SUM(e.duracao) as tempo_total
      FROM estudos e
      JOIN materias m ON e.materia_id = m.id
      WHERE e.usuario_id = ? ${dateFilter}
      GROUP BY m.id, m.nome
      ORDER BY tempo_total DESC
    `;
    
    db.all(queryMaterias, [req.usuario.id], (err, tempoPorMateria) => {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar tempo por matéria' });
      }
      
      res.json({
        ...estatisticas,
        tempo_por_materia: tempoPorMateria
      });
    });
  });
});

// Próximos assuntos para estudar
router.get('/proximos-assuntos', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT DISTINCT a.id, a.nome, m.nome as materia_nome, m.id as materia_id,
           (SELECT COUNT(*) FROM estudos e2 WHERE e2.assunto_id = a.id AND e2.usuario_id = ?) as vezes_estudado
    FROM assuntos a
    JOIN materias m ON a.materia_id = m.id
    WHERE m.usuario_id = ?
    ORDER BY vezes_estudado ASC, a.ordem, a.nome
    LIMIT 10
  `;
  
  db.all(query, [req.usuario.id, req.usuario.id], (err, proximosAssuntos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar próximos assuntos' });
    }
    
    res.json(proximosAssuntos);
  });
});

module.exports = router; 