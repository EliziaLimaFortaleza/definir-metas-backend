const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const nodemailer = require('nodemailer');

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Configuração do nodemailer (para desenvolvimento)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'seu-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'sua-senha-app'
  }
});

// Listar parceiros do usuário
router.get('/', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT * FROM parceiros WHERE usuario_id = ? ORDER BY created_at DESC', 
    [req.usuario.id], (err, parceiros) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar parceiros' });
    }
    
    res.json(parceiros);
  });
});

// Buscar parceiro por ID
router.get('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get('SELECT * FROM parceiros WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], (err, parceiro) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar parceiro' });
    }
    
    if (!parceiro) {
      return res.status(404).json({ message: 'Parceiro não encontrado' });
    }
    
    res.json(parceiro);
  });
});

// Convidar parceiro por email
router.post('/convidar', auth, [
  body('email').isEmail().withMessage('Email inválido'),
  body('nome').optional()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, nome } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar se já existe convite para este email
    db.get('SELECT id FROM parceiros WHERE parceiro_email = ? AND usuario_id = ?', 
      [email, req.usuario.id], (err, parceiroExistente) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao verificar parceiro' });
      }
      
      if (parceiroExistente) {
        db.close();
        return res.status(400).json({ message: 'Convite já enviado para este email' });
      }
      
      // Criar convite
      db.run('INSERT INTO parceiros (usuario_id, parceiro_email, parceiro_nome, status) VALUES (?, ?, ?, ?)', 
        [req.usuario.id, email, nome, 'pendente'], function(err) {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao criar convite' });
        }
        
        const parceiroId = this.lastID;
        
        // Enviar email de convite
        const mailOptions = {
          from: process.env.EMAIL_USER || 'seu-email@gmail.com',
          to: email,
          subject: 'Convite para ser parceiro de estudos',
          html: `
            <h2>Convite para Parceria de Estudos</h2>
            <p>Olá ${nome || 'estudante'}!</p>
            <p>Você foi convidado para ser parceiro de estudos no sistema Definir Metas.</p>
            <p>Para aceitar o convite, acesse: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/parceiros/aceitar/${parceiroId}">Aceitar Convite</a></p>
            <p>Ou copie e cole este link no seu navegador:</p>
            <p>${process.env.FRONTEND_URL || 'http://localhost:3000'}/parceiros/aceitar/${parceiroId}</p>
            <br>
            <p>Atenciosamente,</p>
            <p>Sistema de Estudos Pessoal</p>
          `
        };
        
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Erro ao enviar email:', error);
            // Não falhar se o email não for enviado
          }
        });
        
        // Criar notificação
        db.run('INSERT INTO notificacoes (tipo, titulo, mensagem, usuario_id, parceiro_id) VALUES (?, ?, ?, ?, ?)', 
          ['convite_parceiro', 'Convite enviado', `Convite enviado para ${email}`, req.usuario.id, parceiroId]);
        
        db.close();
        
        res.status(201).json({
          message: 'Convite enviado com sucesso',
          parceiro: {
            id: parceiroId,
            parceiro_email: email,
            parceiro_nome: nome,
            status: 'pendente'
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Aceitar convite de parceiro
router.post('/aceitar/:id', (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.get('SELECT * FROM parceiros WHERE id = ?', [req.params.id], (err, parceiro) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar convite' });
    }
    
    if (!parceiro) {
      db.close();
      return res.status(404).json({ message: 'Convite não encontrado' });
    }
    
    if (parceiro.status !== 'pendente') {
      db.close();
      return res.status(400).json({ message: 'Convite já foi processado' });
    }
    
    // Atualizar status do convite
    db.run('UPDATE parceiros SET status = "aceito", updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [req.params.id], function(err) {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao aceitar convite' });
      }
      
      // Buscar dados do usuário que enviou o convite
      db.get('SELECT nome, email FROM usuarios WHERE id = ?', [parceiro.usuario_id], (err, usuario) => {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao buscar dados do usuário' });
        }
        
        // Enviar email de confirmação
        const mailOptions = {
          from: process.env.EMAIL_USER || 'seu-email@gmail.com',
          to: usuario.email,
          subject: 'Convite de parceiro aceito',
          html: `
            <h2>Convite Aceito!</h2>
            <p>Olá ${usuario.nome}!</p>
            <p>Seu convite para ${parceiro.parceiro_email} foi aceito.</p>
            <p>Agora vocês podem compartilhar metas e acompanhar o progresso um do outro.</p>
            <br>
            <p>Atenciosamente,</p>
            <p>Sistema de Estudos Pessoal</p>
          `
        };
        
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Erro ao enviar email:', error);
          }
        });
        
        // Criar notificação
        db.run('INSERT INTO notificacoes (tipo, titulo, mensagem, usuario_id, parceiro_id) VALUES (?, ?, ?, ?, ?)', 
          ['convite_aceito', 'Convite aceito', `Convite aceito por ${parceiro.parceiro_email}`, usuario.id, req.params.id]);
        
        db.close();
        
        res.json({
          message: 'Convite aceito com sucesso',
          parceiro: {
            id: req.params.id,
            status: 'aceito'
          }
        });
      });
    });
  });
});

// Rejeitar convite de parceiro
router.post('/rejeitar/:id', (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('UPDATE parceiros SET status = "rejeitado", updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [req.params.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao rejeitar convite' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Convite não encontrado' });
    }
    
    res.json({ message: 'Convite rejeitado com sucesso' });
  });
});

// Remover parceiro
router.delete('/:id', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('DELETE FROM parceiros WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao remover parceiro' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Parceiro não encontrado' });
    }
    
    res.json({ message: 'Parceiro removido com sucesso' });
  });
});

// Compartilhar meta com parceiro
router.post('/:id/compartilhar-meta', auth, [
  body('meta_id').isInt().withMessage('ID da meta deve ser um número')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { meta_id } = req.body;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar se o parceiro existe e está aceito
    db.get('SELECT * FROM parceiros WHERE id = ? AND usuario_id = ? AND status = "aceito"', 
      [req.params.id, req.usuario.id], (err, parceiro) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao verificar parceiro' });
      }
      
      if (!parceiro) {
        db.close();
        return res.status(404).json({ message: 'Parceiro não encontrado ou convite não aceito' });
      }
      
      // Verificar se a meta pertence ao usuário
      db.get('SELECT * FROM metas WHERE id = ? AND usuario_id = ?', 
        [meta_id, req.usuario.id], (err, meta) => {
        if (err) {
          db.close();
          return res.status(500).json({ message: 'Erro ao verificar meta' });
        }
        
        if (!meta) {
          db.close();
          return res.status(404).json({ message: 'Meta não encontrada' });
        }
        
        // Verificar se já foi compartilhada
        db.get('SELECT id FROM metas_compartilhadas WHERE meta_id = ? AND parceiro_id = ?', 
          [meta_id, req.params.id], (err, compartilhamento) => {
          if (err) {
            db.close();
            return res.status(500).json({ message: 'Erro ao verificar compartilhamento' });
          }
          
          if (compartilhamento) {
            db.close();
            return res.status(400).json({ message: 'Meta já foi compartilhada com este parceiro' });
          }
          
          // Compartilhar meta
          db.run('INSERT INTO metas_compartilhadas (meta_id, parceiro_id) VALUES (?, ?)', 
            [meta_id, req.params.id], function(err) {
            if (err) {
              db.close();
              return res.status(500).json({ message: 'Erro ao compartilhar meta' });
            }
            
            // Enviar notificação por email
            const mailOptions = {
              from: process.env.EMAIL_USER || 'seu-email@gmail.com',
              to: parceiro.parceiro_email,
              subject: 'Nova meta compartilhada',
              html: `
                <h2>Nova Meta Compartilhada</h2>
                <p>Olá ${parceiro.parceiro_nome || 'parceiro'}!</p>
                <p>Uma nova meta foi compartilhada com você: <strong>${meta.titulo}</strong></p>
                <p>Acesse o sistema para acompanhar o progresso.</p>
                <br>
                <p>Atenciosamente,</p>
                <p>Sistema de Estudos Pessoal</p>
              `
            };
            
            transporter.sendMail(mailOptions, (error, info) => {
              if (error) {
                console.error('Erro ao enviar email:', error);
              }
            });
            
            // Criar notificação
            db.run('INSERT INTO notificacoes (tipo, titulo, mensagem, usuario_id, parceiro_id) VALUES (?, ?, ?, ?, ?)', 
              ['meta_compartilhada', 'Meta compartilhada', `Meta "${meta.titulo}" compartilhada`, req.usuario.id, req.params.id]);
            
            db.close();
            
            res.status(201).json({
              message: 'Meta compartilhada com sucesso',
              compartilhamento: {
                meta_id,
                parceiro_id: req.params.id
              }
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Listar metas compartilhadas com parceiro
router.get('/:id/metas-compartilhadas', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT mc.*, m.titulo, m.descricao, m.status, m.carga_horaria_total
    FROM metas_compartilhadas mc
    JOIN metas m ON mc.meta_id = m.id
    WHERE mc.parceiro_id = ?
    ORDER BY mc.created_at DESC
  `;
  
  db.all(query, [req.params.id], (err, metas) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar metas compartilhadas' });
    }
    
    res.json(metas);
  });
});

// Listar notificações do usuário
router.get('/notificacoes/listar', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT * FROM notificacoes WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 50', 
    [req.usuario.id], (err, notificacoes) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar notificações' });
    }
    
    res.json(notificacoes);
  });
});

// Marcar notificação como lida
router.patch('/notificacoes/:id/ler', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  db.run('UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?', 
    [req.params.id, req.usuario.id], function(err) {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao marcar notificação como lida' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Notificação não encontrada' });
    }
    
    res.json({ message: 'Notificação marcada como lida' });
  });
});

module.exports = router; 