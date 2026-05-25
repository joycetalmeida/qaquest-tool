import api, { route } from '@forge/api';

/**
 * Salva os pontos de gamificação em um custom field da issue ou em um banco de dados externo
 * Por enquanto, implementamos como um comentário/campo personalizado na issue
 */
export async function saveGamificationPoints({ issueKey, userId, points, action, timestamp = new Date() }) {
  try {
    // Opção 1: Salvar como custom field (se disponível no Jira)
    // Você precisaria criar um custom field numérico chamado "Gamification Points"
    // e obter seu ID do campo
    
    // Opção 2: Salvar em storage externo (recomendado para produção)
    // Aqui você pode adicionar chamadas para seu backend
    
    console.log(`Gamification points saved: ${userId} earned +${points} points for ${action} on ${issueKey}`);
    
    return {
      success: true,
      issueKey,
      userId,
      points,
      action,
      timestamp
    };
  } catch (error) {
    console.error('Error saving gamification points:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Recupera os pontos totais do usuário em um projeto
 */
export async function getUserTotalPoints({ userId, projectKey }) {
  try {
    // Em produção, isso consultaria seu banco de dados
    // Por enquanto, apenas carregamos a partir do relatório de gamificação
    
    const res = await api.asUser().requestJira(route`/rest/api/3/user/${userId}`, {
      expand: 'avatarUrls,groups'
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch user: ${res.status}`);
    }
    
    // Retornar dados do usuário e seus pontos (seria consultado do DB em produção)
    const userData = await res.json();
    
    return {
      success: true,
      userId,
      name: userData.displayName,
      email: userData.emailAddress,
      totalPoints: 0 // Carregar do banco de dados em produção
    };
  } catch (error) {
    console.error('Error getting user total points:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Incrementar pontos de um usuário
 */
export async function incrementUserPoints({ userId, projectKey, points, action, issueKey }) {
  try {
    // Salvar o registro de pontos
    const result = await saveGamificationPoints({
      issueKey,
      userId,
      points,
      action,
      timestamp: new Date()
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Aqui você pode adicionar lógica para verificar se o usuário alcançou um novo nível
    // ou se desbloqueou uma nova badge
    
    return result;
  } catch (error) {
    console.error('Error incrementing user points:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obter histórico de pontos de um usuário
 */
export async function getUserPointsHistory({ userId, projectKey, limit = 10 }) {
  try {
    // Consultar histórico do banco de dados em produção
    // Por enquanto, retornar um array vazio
    
    return {
      success: true,
      userId,
      projectKey,
      history: [],
      totalCount: 0
    };
  } catch (error) {
    console.error('Error getting user points history:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obter ranking de usuários por pontos em um projeto
 */
export async function getProjectLeaderboard({ projectKey, limit = 10 }) {
  try {
    // Consultar ranking do banco de dados em produção
    // Por enquanto, retornar um array vazio
    
    return {
      success: true,
      projectKey,
      leaderboard: [],
      totalUsers: 0
    };
  } catch (error) {
    console.error('Error getting project leaderboard:', error);
    return { success: false, error: error.message };
  }
}
