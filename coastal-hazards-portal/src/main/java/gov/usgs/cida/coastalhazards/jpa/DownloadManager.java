package gov.usgs.cida.coastalhazards.jpa;

import gov.usgs.cida.coastalhazards.model.util.Download;
import java.util.List;
import javax.persistence.EntityManager;
import javax.persistence.EntityTransaction;
import javax.persistence.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 *
 * @author Jordan Walker <jiwalker@usgs.gov>
 */
public class DownloadManager implements AutoCloseable {
	
	private static final Logger log = LoggerFactory.getLogger(DownloadManager.class);

	private static final String HQL_SELECT_BY_ID = "select d from Download d where d.itemId = :id or d.sessionId = :id";
	private static final String HQL_SELECT_ALL = "select d from Download d";
	private static final String HQL_DELETE_MISSING = "delete from Download d where d.persistanceURI IS NULL";

	private EntityManager em;

	public DownloadManager() {
		em = JPAHelper.getEntityManagerFactory().createEntityManager();
	}

	public Download load(String id) {
		Download download = null;

		Query selectQuery = em.createQuery(HQL_SELECT_BY_ID);
		selectQuery.setParameter("id", id);
		List<Download> resultList = selectQuery.getResultList();
		if (!resultList.isEmpty()) {
			download = resultList.get(0);
		}
		return download;
	}

	public void save(Download download) {
		EntityTransaction transaction = em.getTransaction();
		try {
			transaction.begin();
			em.persist(download);
			transaction.commit();
		} catch (Exception ex) {
			if (transaction.isActive()) {
				transaction.rollback();
			}
		}
	}
	
	public void update(Download download) {
		EntityTransaction transaction = em.getTransaction();
		try {
			transaction.begin();
			em.merge(download);
			transaction.commit();
		} catch (Exception ex) {
			log.error("Unable to update download", ex);
			if (transaction.isActive()) {
				transaction.rollback();
			}
		}
	}

	/**
	 * This needs to be wrapped in transaction or it will fail
	 * @param download 
	 */
	public void delete(Download download) {
		em.remove(download);
	}
	
	public void deleteAllMissing() {
		Query deleteQuery = em.createQuery(HQL_DELETE_MISSING);
		EntityTransaction transaction = em.getTransaction();
		try {
			transaction.begin();
			int deleted = deleteQuery.executeUpdate();
			transaction.commit();
		} catch (Exception ex) {
			log.error("Error deleting downloads", ex);
			if (transaction.isActive()) {
				transaction.rollback();
			}
		}
		
	}

	public List<Download> getAllStagedDownloads() {
		List<Download> resultList;
		Query selectQuery = em.createQuery(HQL_SELECT_ALL);
		resultList = selectQuery.getResultList();
		return resultList;
	}
	
	public EntityTransaction getTransaction() {
		return em.getTransaction();
	}

	@Override
	public void close() {
		JPAHelper.close(em);
	}
}
