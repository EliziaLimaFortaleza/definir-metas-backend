const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'questao-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// Listar questões do usuário
router.get('/', auth, (req, res) => {
  const { materia_id, assunto_id, foi_refeita, foi_acertada } = req.query;
  const db = new sqlite3.Database(dbPath);
  
  let query = `
    SELECT q.*, m.nome as materia_nome, a.nome as assunto_nome
    FROM questoes q
    JOIN materias m ON q.materia_id = m.id
    JOIN assuntos a ON q.assunto_id = a.id
    WHERE q.usuario_id = ?
  `;
  
  const params = [req.usuario.id];
  
  if (materia_id) {
    query += ' AND q.materia_id = ?';
    params.push(materia_id);
  }
  
  if (assunto_id) {
    query += ' AND q.assunto_id = ?';
    params.push(assunto_id);
  }
  
  if (foi_refeita !== undefined) {
    query += ' AND q.foi_refeita = ?';
    params.push(foi_refeita === 'true' ? 1 : 0);
  }
  
  if (foi_acertada !== undefined) {
    query += ' AND q.foi_acertada = ?';
    params.push(foi_acertada === 'true' ? 1 : 0);
  }
  
  query += ' ORDER BY q.created_at DESC';
  
  db.all(query, params, (err, questoes) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar questões' });
    }
    
    res.json(questoes);
  });
});

// Buscar questão por ID
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get(`
    SELECT q.*, m.nome as materia_nome, a.nome as assunto_nome
    FROM questoes q
    JOIN materias m ON q.materia_id = m.id
    JOIN assuntos a ON q.assunto_id = a.id
    WHERE q.id = ? AND q.usuario_id = ?
  `, [req.params.id, req.usuario.id], (err, questao) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar questão' });
    }
    
    if (!questao) {
      return res.status(404).json({ message: 'Questão não encontrada' });
    }
    
    res.json(questao);
  });
});

// Criar nova questão
router.post('/', auth, upload.single('imagem'), [
  body('texto').notEmpty().withMessage('Texto da questão é obrigatório'),
  body('materia_id').isInt().withMessage('ID da matéria deve ser um número'),
  body('assunto_id').isInt().withMessage('ID do assunto deve ser um número'),
  body('comentario').optional()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { texto, materia_id, assunto_id, comentario } = req.body;
    const imagem_url = req.file ? `/uploads/${req.file.filename}` : null;
    
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
        
        // Criar questão
        db.run('INSERT INTO questoes (texto, imagem_url, comentario, materia_id, assunto_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?)', 
          [texto, imagem_url, comentario, materia_id, assunto_id, req.usuario.id], function(err) {
          db.close();
          
          if (err) {
            return res.status(500).json({ message: 'Erro ao criar questão' });
          }
          
          res.status(201).json({
            message: 'Questão criada com sucesso',
            questao: {
              id: this.lastID,
              texto,
              imagem_url,
              comentario,
              materia_id,
              assunto_id,
              usuario_id: req.usuario.id
            }
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar questão
router.put('/:id', auth, upload.single('imagem'), [
  body('texto').notEmpty().withMessage('Texto da questão é obrigatório'),
  body('comentario').optional(),
  body('foi_refeita').optional().isBoolean().withMessage('foi_refeita deve ser um booleano'),
  body('foi_acertada').optional().isBoolean().withMessage('foi_acertada deve ser um booleano')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { texto, comentario, foi_refeita, foi_acertada } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    // Se uma nova imagem foi enviada, atualizar o URL
    let imagem_url = null;
    if (req.file) {
      imagem_url = `/uploads/${req.file.filename}`;
      
      // Buscar questão atual para deletar imagem antiga
      db.get('SELECT imagem_url FROM questoes WHERE id = ? AND usuario_id = ?', 
        [req.params.id, req.usuario.id], (err, questaoAtual) => {
        if (questaoAtual && questaoAtual.imagem_url) {
          const oldImagePath = path.join(__dirname, '../..', questaoAtual.imagem_url);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      });
    }
    
    let updateQuery = 'UPDATE questoes SET texto = ?, comentario = ?, updated_at = CURRENT_TIMESTAMP';
    let params = [texto, comentario];
    
    if (imagem_url) {
      updateQuery += ', imagem_url = ?';
      params.push(imagem_url);
    }
    
    if (foi_refeita !== undefined) {
      updateQuery += ', foi_refeita = ?';
      params.push(foi_refeita ? 1 : 0);
    }
    
    if (foi_acertada !== undefined) {
      updateQuery += ', foi_acertada = ?';
      params.push(foi_acertada ? 1 : 0);
    }
    
    updateQuery += ' WHERE id = ? AND usuario_id = ?';
    params.push(req.params.id, req.usuario.id);
    
    db.run(updateQuery, params, function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao atualizar questão' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Questão não encontrada' });
      }
      
      res.json({
        message: 'Questão atualizada com sucesso',
        questao: { 
          id: req.params.id, 
          texto, 
          comentario, 
          foi_refeita, 
          foi_acertada,
          imagem_url: imagem_url || undefined
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir questão
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  // Buscar questão para deletar imagem
  db.get('SELECT imagem_url FROM questoes WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], (err, questao) => {
    if (questao && questao.imagem_url) {
      const imagePath = path.join(__dirname, '../..', questao.imagem_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Deletar questão
    db.run('DELETE FROM questoes WHERE id = ? AND usuario_id = ?', 
      [req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao excluir questão' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Questão não encontrada' });
      }
      
      res.json({ message: 'Questão excluída com sucesso' });
    });
  });
});

// Marcar questão como refeita
router.patch('/:id/refazer', auth, [
  body('foi_acertada').isBoolean().withMessage('foi_acertada deve ser um booleano')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { foi_acertada } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    db.run('UPDATE questoes SET foi_refeita = 1, foi_acertada = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', 
      [foi_acertada ? 1 : 0, req.params.id, req.usuario.id], function(err) {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao marcar questão como refeita' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Questão não encontrada' });
      }
      
      res.json({ 
        message: 'Questão marcada como refeita',
        foi_acertada
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Estatísticas do caderno de questões
router.get('/estatisticas/geral', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      COUNT(*) as total_questoes,
      SUM(CASE WHEN foi_refeita = 1 THEN 1 ELSE 0 END) as questoes_refeitas,
      SUM(CASE WHEN foi_refeita = 1 AND foi_acertada = 1 THEN 1 ELSE 0 END) as questoes_acertadas,
      COUNT(DISTINCT materia_id) as materias_com_questoes,
      COUNT(DISTINCT assunto_id) as assuntos_com_questoes
    FROM questoes
    WHERE usuario_id = ?
  `;
  
  db.get(query, [req.usuario.id], (err, estatisticas) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
    
    // Buscar questões por matéria
    const queryMaterias = `
      SELECT m.nome, COUNT(q.id) as total_questoes,
             SUM(CASE WHEN q.foi_refeita = 1 THEN 1 ELSE 0 END) as questoes_refeitas,
             SUM(CASE WHEN q.foi_refeita = 1 AND q.foi_acertada = 1 THEN 1 ELSE 0 END) as questoes_acertadas
      FROM questoes q
      JOIN materias m ON q.materia_id = m.id
      WHERE q.usuario_id = ?
      GROUP BY m.id, m.nome
      ORDER BY total_questoes DESC
    `;
    
    db.all(queryMaterias, [req.usuario.id], (err, questoesPorMateria) => {
      db.close();
      
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar questões por matéria' });
      }
      
      res.json({
        ...estatisticas,
        questoes_por_materia: questoesPorMateria
      });
    });
  });
});

// Buscar questões para revisão (não refeitas ou erradas)
router.get('/revisao/pendentes', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT q.*, m.nome as materia_nome, a.nome as assunto_nome
    FROM questoes q
    JOIN materias m ON q.materia_id = m.id
    JOIN assuntos a ON q.assunto_id = a.id
    WHERE q.usuario_id = ? AND (q.foi_refeita = 0 OR (q.foi_refeita = 1 AND q.foi_acertada = 0))
    ORDER BY q.created_at ASC
    LIMIT 20
  `;
  
  db.all(query, [req.usuario.id], (err, questoes) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar questões para revisão' });
    }
    
    res.json(questoes);
  });
});

module.exports = router; 