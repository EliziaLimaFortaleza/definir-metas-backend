const express = require('express');
const { auth } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, '../../database.sqlite');

// Progresso geral do usuário
router.get('/geral', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      (SELECT COUNT(*) FROM concursos WHERE usuario_id = ?) as total_concursos,
      (SELECT COUNT(*) FROM materias WHERE usuario_id = ?) as total_materias,
      (SELECT COUNT(*) FROM assuntos a JOIN materias m ON a.materia_id = m.id WHERE m.usuario_id = ?) as total_assuntos,
      (SELECT COUNT(*) FROM metas WHERE usuario_id = ?) as total_metas,
      (SELECT COUNT(*) FROM metas WHERE usuario_id = ? AND status = 'concluida') as metas_concluidas,
      (SELECT COUNT(*) FROM estudos WHERE usuario_id = ?) as total_estudos,
      (SELECT COALESCE(SUM(duracao), 0) FROM estudos WHERE usuario_id = ?) as tempo_total_estudo,
      (SELECT COUNT(*) FROM questoes WHERE usuario_id = ?) as total_questoes,
      (SELECT COUNT(*) FROM parceiros WHERE usuario_id = ? AND status = 'aceito') as total_parceiros
  `;
  
  db.get(query, [
    req.usuario.id, req.usuario.id, req.usuario.id, 
    req.usuario.id, req.usuario.id, req.usuario.id, 
    req.usuario.id, req.usuario.id, req.usuario.id
  ], (err, progresso) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao buscar progresso geral' });
    }
    
    // Calcular percentual de metas concluídas
    progresso.percentual_metas_concluidas = progresso.total_metas > 0 
      ? Math.round((progresso.metas_concluidas * 100) / progresso.total_metas) 
      : 0;
    
    // Converter tempo total para horas
    progresso.tempo_total_horas = Math.round(progresso.tempo_total_estudo / 60);
    
    res.json(progresso);
  });
});

// Progresso por matéria
router.get('/materias', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      m.id,
      m.nome,
      m.descricao,
      COUNT(DISTINCT a.id) as total_assuntos,
      COUNT(DISTINCT e.id) as total_estudos,
      COALESCE(SUM(e.duracao), 0) as tempo_total,
      COUNT(DISTINCT q.id) as total_questoes,
      COUNT(DISTINCT CASE WHEN q.foi_refeita = 1 THEN q.id END) as questoes_refeitas,
      COUNT(DISTINCT CASE WHEN q.foi_refeita = 1 AND q.foi_acertada = 1 THEN q.id END) as questoes_acertadas
    FROM materias m
    LEFT JOIN assuntos a ON m.id = a.materia_id
    LEFT JOIN estudos e ON a.id = e.assunto_id AND e.usuario_id = m.usuario_id
    LEFT JOIN questoes q ON a.id = q.assunto_id AND q.usuario_id = m.usuario_id
    WHERE m.usuario_id = ?
    GROUP BY m.id, m.nome, m.descricao
    ORDER BY tempo_total DESC
  `;
  
  db.all(query, [req.usuario.id], (err, materias) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar progresso por matéria' });
    }
    
    // Calcular percentuais
    materias.forEach(materia => {
      materia.tempo_horas = Math.round(materia.tempo_total / 60);
      materia.percentual_questoes_refeitas = materia.total_questoes > 0 
        ? Math.round((materia.questoes_refeitas * 100) / materia.total_questoes) 
        : 0;
      materia.percentual_questoes_acertadas = materia.questoes_refeitas > 0 
        ? Math.round((materia.questoes_acertadas * 100) / materia.questoes_refeitas) 
        : 0;
    });
    
    res.json(materias);
  });
});

// Progresso por assunto
router.get('/assuntos/:materiaId', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      a.id,
      a.nome,
      a.descricao,
      COUNT(DISTINCT e.id) as total_estudos,
      COALESCE(SUM(e.duracao), 0) as tempo_total,
      COUNT(DISTINCT q.id) as total_questoes,
      COUNT(DISTINCT CASE WHEN q.foi_refeita = 1 THEN q.id END) as questoes_refeitas,
      COUNT(DISTINCT CASE WHEN q.foi_refeita = 1 AND q.foi_acertada = 1 THEN q.id END) as questoes_acertadas
    FROM assuntos a
    LEFT JOIN estudos e ON a.id = e.assunto_id AND e.usuario_id = ?
    LEFT JOIN questoes q ON a.id = q.assunto_id AND q.usuario_id = ?
    WHERE a.materia_id = ?
    GROUP BY a.id, a.nome, a.descricao
    ORDER BY a.ordem, a.nome
  `;
  
  db.all(query, [req.usuario.id, req.usuario.id, req.params.materiaId], (err, assuntos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar progresso por assunto' });
    }
    
    // Calcular percentuais
    assuntos.forEach(assunto => {
      assunto.tempo_horas = Math.round(assunto.tempo_total / 60);
      assunto.percentual_questoes_refeitas = assunto.total_questoes > 0 
        ? Math.round((assunto.questoes_refeitas * 100) / assunto.total_questoes) 
        : 0;
      assunto.percentual_questoes_acertadas = assunto.questoes_refeitas > 0 
        ? Math.round((assunto.questoes_acertadas * 100) / assunto.questoes_refeitas) 
        : 0;
    });
    
    res.json(assuntos);
  });
});

// Histórico de estudos (diário, semanal, mensal)
router.get('/historico', auth, (req, res) => {
  const { periodo = 'mes' } = req.query; // 'dia', 'semana', 'mes', 'ano'
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
      dateFilter = "AND e.data >= DATE('now', '-30 days')";
  }
  
  const query = `
    SELECT 
      e.data,
      COUNT(*) as total_estudos,
      SUM(e.duracao) as tempo_total,
      COUNT(DISTINCT e.materia_id) as materias_estudadas,
      COUNT(DISTINCT e.assunto_id) as assuntos_estudados
    FROM estudos e
    WHERE e.usuario_id = ? ${dateFilter}
    GROUP BY e.data
    ORDER BY e.data DESC
  `;
  
  db.all(query, [req.usuario.id], (err, historico) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar histórico' });
    }
    
    // Converter tempo para horas
    historico.forEach(item => {
      item.tempo_horas = Math.round(item.tempo_total / 60);
    });
    
    res.json(historico);
  });
});

// Estatísticas de estudo por período
router.get('/estatisticas-periodo', auth, (req, res) => {
  const { periodo = 'mes' } = req.query;
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
      dateFilter = "AND e.data >= DATE('now', '-30 days')";
  }
  
  const query = `
    SELECT 
      COUNT(*) as total_estudos,
      COALESCE(SUM(e.duracao), 0) as tempo_total,
      COALESCE(AVG(e.duracao), 0) as tempo_medio,
      COUNT(DISTINCT e.data) as dias_estudados,
      COUNT(DISTINCT e.materia_id) as materias_estudadas,
      COUNT(DISTINCT e.assunto_id) as assuntos_estudados,
      COALESCE(SUM(e.duracao) / COUNT(DISTINCT e.data), 0) as tempo_medio_diario
    FROM estudos e
    WHERE e.usuario_id = ? ${dateFilter}
  `;
  
  db.get(query, [req.usuario.id], (err, estatisticas) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar estatísticas do período' });
    }
    
    // Converter tempos para horas
    estatisticas.tempo_total_horas = Math.round(estatisticas.tempo_total / 60);
    estatisticas.tempo_medio_horas = Math.round(estatisticas.tempo_medio / 60);
    estatisticas.tempo_medio_diario_horas = Math.round(estatisticas.tempo_medio_diario / 60);
    
    res.json(estatisticas);
  });
});

// Tópicos já estudados vs pendentes
router.get('/topicos-status', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      a.id,
      a.nome as assunto_nome,
      m.nome as materia_nome,
      m.id as materia_id,
      CASE 
        WHEN COUNT(e.id) > 0 THEN 'estudado'
        ELSE 'pendente'
      END as status,
      COUNT(e.id) as vezes_estudado,
      COALESCE(SUM(e.duracao), 0) as tempo_total
    FROM assuntos a
    JOIN materias m ON a.materia_id = m.id
    LEFT JOIN estudos e ON a.id = e.assunto_id AND e.usuario_id = m.usuario_id
    WHERE m.usuario_id = ?
    GROUP BY a.id, a.nome, m.nome, m.id
    ORDER BY m.nome, a.ordem, a.nome
  `;
  
  db.all(query, [req.usuario.id], (err, topicos) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar status dos tópicos' });
    }
    
    // Calcular estatísticas
    const estudados = topicos.filter(t => t.status === 'estudado');
    const pendentes = topicos.filter(t => t.status === 'pendente');
    
    const estatisticas = {
      total_topicos: topicos.length,
      topicos_estudados: estudados.length,
      topicos_pendentes: pendentes.length,
      percentual_estudado: topicos.length > 0 ? Math.round((estudados.length * 100) / topicos.length) : 0,
      topicos: topicos
    };
    
    res.json(estatisticas);
  });
});

// Comparação de progresso com parceiro
router.get('/comparacao-parceiro/:parceiroId', auth, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  
  // Verificar se o parceiro existe e está aceito
  db.get('SELECT * FROM parceiros WHERE id = ? AND usuario_id = ? AND status = "aceito"', 
    [req.params.parceiroId, req.usuario.id], (err, parceiro) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: 'Erro ao verificar parceiro' });
    }
    
    if (!parceiro) {
      db.close();
      return res.status(404).json({ message: 'Parceiro não encontrado ou convite não aceito' });
    }
    
    // Buscar dados do usuário atual
    const queryUsuario = `
      SELECT 
        COUNT(DISTINCT e.id) as total_estudos,
        COALESCE(SUM(e.duracao), 0) as tempo_total,
        COUNT(DISTINCT e.data) as dias_estudados,
        COUNT(DISTINCT e.materia_id) as materias_estudadas,
        COUNT(DISTINCT e.assunto_id) as assuntos_estudados
      FROM estudos e
      WHERE e.usuario_id = ?
    `;
    
    db.get(queryUsuario, [req.usuario.id], (err, dadosUsuario) => {
      if (err) {
        db.close();
        return res.status(500).json({ message: 'Erro ao buscar dados do usuário' });
      }
      
      // Buscar dados do parceiro (simulado - em um sistema real, você teria acesso aos dados do parceiro)
      // Por enquanto, vamos retornar dados simulados
      const dadosParceiro = {
        total_estudos: Math.floor(dadosUsuario.total_estudos * 0.8), // Simulação
        tempo_total: Math.floor(dadosUsuario.tempo_total * 0.9),
        dias_estudados: Math.floor(dadosUsuario.dias_estudados * 0.85),
        materias_estudadas: Math.floor(dadosUsuario.materias_estudadas * 0.9),
        assuntos_estudados: Math.floor(dadosUsuario.assuntos_estudados * 0.8)
      };
      
      db.close();
      
      // Calcular comparações
      const comparacao = {
        usuario: {
          ...dadosUsuario,
          tempo_total_horas: Math.round(dadosUsuario.tempo_total / 60)
        },
        parceiro: {
          ...dadosParceiro,
          tempo_total_horas: Math.round(dadosParceiro.tempo_total / 60)
        },
        diferencas: {
          total_estudos: dadosUsuario.total_estudos - dadosParceiro.total_estudos,
          tempo_total: dadosUsuario.tempo_total - dadosParceiro.tempo_total,
          dias_estudados: dadosUsuario.dias_estudados - dadosParceiro.dias_estudados,
          materias_estudadas: dadosUsuario.materias_estudadas - dadosParceiro.materias_estudadas,
          assuntos_estudados: dadosUsuario.assuntos_estudados - dadosParceiro.assuntos_estudados
        }
      };
      
      res.json(comparacao);
    });
  });
});

// Gráfico de progresso ao longo do tempo
router.get('/grafico-progresso', auth, (req, res) => {
  const { dias = 30 } = req.query;
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      e.data,
      SUM(e.duracao) as tempo_diario,
      COUNT(*) as estudos_diarios,
      COUNT(DISTINCT e.materia_id) as materias_diarias
    FROM estudos e
    WHERE e.usuario_id = ? AND e.data >= DATE('now', '-${dias} days')
    GROUP BY e.data
    ORDER BY e.data ASC
  `;
  
  db.all(query, [req.usuario.id], (err, dados) => {
    db.close();
    
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar dados do gráfico' });
    }
    
    // Converter tempo para horas
    dados.forEach(item => {
      item.tempo_horas = Math.round(item.tempo_diario / 60);
    });
    
    res.json(dados);
  });
});

module.exports = router; 