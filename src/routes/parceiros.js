const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

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
  const query = `
    SELECT p.id, p.status, p.parceiro_email, u.nome as parceiro_nome
    FROM parceiros p
    LEFT JOIN usuarios u ON p.parceiro_usuario_id = u.id
    WHERE p.usuario_id = ?
  `;
  db.all(query, [req.usuario.id], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ message: 'Erro ao buscar parceiros.' });
    res.json(rows);
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

// Convidar parceiro
router.post('/convidar', auth, [body('email').isEmail()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;
  const db = new sqlite3.Database(dbPath);

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, partnerUser) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro no banco de dados.' });
    }
    if (!partnerUser) {
      db.close();
      return res.status(404).json({ message: 'Usuário parceiro não encontrado no sistema.' });
    }
    if (partnerUser.id === req.usuario.id) {
      db.close();
      return res.status(400).json({ message: 'Você não pode adicionar a si mesmo como parceiro.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000 * 24); // 24 horas

    const query = `
      INSERT INTO parceiros (usuario_id, parceiro_email, parceiro_usuario_id, status, token_convite, expires_at)
      VALUES (?, ?, ?, 'pendente', ?, ?)
    `;
    db.run(query, [req.usuario.id, email, partnerUser.id, token, expires.toISOString()], async function(err) {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao enviar convite.' });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const inviteUrl = `${frontendUrl}/parceiros/aceitar/${token}`;

      // Verificar se as credenciais de email estão configuradas
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const mailOptions = {
          to: email,
          from: process.env.EMAIL_USER,
          subject: 'Convite de Parceria de Estudos',
          text: `Você foi convidado para ser um parceiro de estudos por ${req.usuario.nome}.\n\n` +
                `Por favor, clique no link a seguir, ou cole no seu navegador para completar o processo:\n\n` +
                `${inviteUrl}\n\n` +
                `Se você não solicitou isso, por favor, ignore este e-mail.\n`
        };

        try {
          await transporter.sendMail(mailOptions);
          res.status(200).json({ message: 'Convite enviado com sucesso!' });
        } catch (err) {
          console.error('Erro ao enviar email:', err);
          res.status(200).json({ 
            message: 'Convite criado! Compartilhe este link com o parceiro:',
            inviteUrl: inviteUrl,
            note: 'Email não foi enviado automaticamente. Compartilhe o link manualmente.'
          });
        }
      } else {
        // Sem configuração de email, retornar o link para compartilhamento manual
        res.status(200).json({ 
          message: 'Convite criado! Compartilhe este link com o parceiro:',
          inviteUrl: inviteUrl,
          note: 'Email não configurado. Compartilhe o link manualmente.'
        });
      }
      
      db.close();
    });
  });
});

// Aceitar convite
router.post('/aceitar/:token', auth, (req, res) => {
  const { token } = req.params;
  const db = new sqlite3.Database(dbPath);

  const query = `
    SELECT * FROM parceiros 
    WHERE token_convite = ? 
      AND parceiro_usuario_id = ? 
      AND expires_at > ?
  `;
  db.get(query, [token, req.usuario.id, new Date().toISOString()], (err, partnership) => {
    if (err || !partnership) {
      db.close();
      return res.status(400).json({ message: 'Token de convite inválido ou expirado.' });
    }

    if (partnership.status === 'aceito') {
      db.close();
      return res.status(400).json({ message: 'Convite já aceito.' });
    }

    db.run("UPDATE parceiros SET status = 'aceito', token_convite = NULL, expires_at = NULL WHERE id = ?", [partnership.id], (err) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao aceitar convite.' });
      }
      
      // Criar a parceria inversa
      const inverseQuery = `
        INSERT INTO parceiros (usuario_id, parceiro_usuario_id, parceiro_email, status)
        VALUES (?, ?, ?, 'aceito')
      `;
      db.run(inverseQuery, [partnership.parceiro_usuario_id, partnership.usuario_id, req.usuario.email], (err) => {
        db.close();
        if (err) {
          // A lógica de rollback seria ideal aqui, mas para simplicidade, apenas logamos o erro
          console.error('Erro ao criar parceria inversa:', err);
        }
        res.status(200).json({ message: 'Parceria aceita com sucesso!' });
      });
    });
  });
});

// Remover parceiro
router.delete('/:id', auth, (req, res) => {
  const { id } = req.params;
  const db = new sqlite3.Database(dbPath);
  
  // Encontrar a parceria para remover o inverso também
  db.get('SELECT * FROM parceiros WHERE id = ? AND usuario_id = ?', [id, req.usuario.id], (err, partnership) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar parceria.' });
    }
    if (!partnership) {
      db.close();
      return res.status(404).json({ message: 'Parceria não encontrada.' });
    }

    const inversePartnerId = partnership.parceiro_usuario_id;
    const inverseUserEmail = partnership.parceiro_email;
    
    db.serialize(() => {
      db.run('DELETE FROM parceiros WHERE id = ?', [id]);
      db.run('DELETE FROM parceiros WHERE usuario_id = ? AND parceiro_usuario_id = ?', [inversePartnerId, req.usuario.id]);
      db.close((err) => {
        if (err) return res.status(500).json({ message: 'Erro ao remover parceiro.' });
        res.status(200).json({ message: 'Parceiro removido com sucesso.' });
      });
    });
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