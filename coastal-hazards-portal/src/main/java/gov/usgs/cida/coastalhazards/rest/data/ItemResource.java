package gov.usgs.cida.coastalhazards.rest.data;

import gov.usgs.cida.coastalhazards.exception.BadRequestException;
import gov.usgs.cida.coastalhazards.gson.GsonUtil;
import gov.usgs.cida.coastalhazards.jpa.ItemManager;
import gov.usgs.cida.coastalhazards.jpa.StatusManager;
import gov.usgs.cida.coastalhazards.jpa.ThumbnailManager;
import gov.usgs.cida.coastalhazards.model.Item;
import gov.usgs.cida.coastalhazards.model.util.Status;
import gov.usgs.cida.coastalhazards.rest.security.CoastalHazardsTokenBasedSecurityFilter;
import gov.usgs.cida.utilities.HTTPCachingUtil;
import gov.usgs.cida.utilities.properties.JNDISingleton;
import java.net.URI;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.annotation.security.PermitAll;
import javax.annotation.security.RolesAllowed;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.Consumes;
import javax.ws.rs.DELETE;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.NotFoundException;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Request;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.UriBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 *
 *
 * @author jordan
 */
@Path(DataURI.ITEM_PATH)
@PermitAll //says that all methods, unless otherwise secured, will be allowed by default
public class ItemResource {
	
	private static final Logger log = LoggerFactory.getLogger(ItemResource.class);

	public static final String PUBLIC_URL = JNDISingleton.getInstance()
			.getProperty("coastal-hazards.public.url", "http://localhost:8080/coastal-hazards-portal");

	/**
	 * Retrieves representation of an instance of
	 * gov.usgs.cida.coastalhazards.model.Item
	 *
	 * @param id identifier of requested item
	 * @param subtree whether to return all items below this as a subtree
	 * @param request request object
	 * @return JSON representation of the item(s)
	 */
	@GET
	@Path("/{id}")
	@Produces(MediaType.APPLICATION_JSON)
	public Response getItem(@PathParam("id") String id,
			@DefaultValue("false") @QueryParam("subtree") boolean subtree,
			@Context Request request) {
		Response response = null;
		try (ItemManager itemManager = new ItemManager(); StatusManager statusMan = new StatusManager()) {
			Item item = itemManager.load(id);
			if (item == null) {
				throw new NotFoundException();
			}
			else {
				Status lastUpdate = statusMan.load(Status.StatusName.ITEM_UPDATE);
				Date modified = new Date();
				if (lastUpdate != null) {
					modified = lastUpdate.getLastUpdate();
				}
				
				Response unmodified = HTTPCachingUtil.checkModified(request, modified);
				if (unmodified != null) {
					response = unmodified;
				} else {
					String jsonResult = item.toJSON(subtree);
					response = Response.ok(jsonResult, MediaType.APPLICATION_JSON_TYPE).lastModified(modified).build();
				}
			}
		}
		return response;
	}

	@GET
	@Produces(MediaType.APPLICATION_JSON)
	public Response searchItems(
			@DefaultValue("") @QueryParam("query") List<String> query,
			@DefaultValue("") @QueryParam("type") List<String> type,
			@DefaultValue("popularity") @QueryParam("sortBy") String sortBy,
			@DefaultValue("-1") @QueryParam("count") int count,
			@DefaultValue("") @QueryParam("bbox") String bbox,
			@DefaultValue("false") @QueryParam("subtree") boolean subtree,
			@DefaultValue("false") @QueryParam("showDisabled") boolean showDisabled) {
		// need to figure out how to search popularity and bbox yet
		Response response = null;
		try (ItemManager itemManager = new ItemManager()) {
			String jsonResult = itemManager.query(query, type, sortBy, count, bbox, subtree, showDisabled);
			response = Response.ok(jsonResult, MediaType.APPLICATION_JSON_TYPE).build();
		}
		return response;
	}

	/**
	 * Only allows one card to be posted at a time for now
	 *
	 * @param content Posted content as text string (should be JSON)
	 * @param request passed through context of request
	 * @return
	 */
	@RolesAllowed({CoastalHazardsTokenBasedSecurityFilter.CCH_ADMIN_ROLE})
	@POST
	@Consumes(MediaType.APPLICATION_JSON)
	@Produces(MediaType.APPLICATION_JSON)
	public Response postItem(String content, @Context HttpServletRequest request) {
		Response response;
		try (ItemManager itemManager = new ItemManager()) {
			Item item = Item.fromJSON(content);
			final String id = itemManager.persist(item);
			if (null == id) {
				throw new BadRequestException();
			}
			else {
				Map<String, Object> ok = new HashMap<String, Object>() {
					private static final long serialVersionUID = 2398472L;

					{
						put("id", id);
					}
				};

				response = Response.ok(GsonUtil.getDefault().toJson(ok, HashMap.class), MediaType.APPLICATION_JSON_TYPE).build();
				
				
			}
			try (StatusManager statusMan = new StatusManager(); ThumbnailManager thumbMan = new ThumbnailManager()) {
				Status status = new Status();
				status.setStatusName(Status.StatusName.ITEM_UPDATE);
				statusMan.save(status);

				thumbMan.updateDirtyBits(id);
			}
		}
		
		return response;
	}

	/**
	 * @param request
	 * @param id
	 * @param content
	 * @return
	 */
	@RolesAllowed({CoastalHazardsTokenBasedSecurityFilter.CCH_ADMIN_ROLE})
	@PUT
	@Path("/{id}")
	@Consumes(MediaType.APPLICATION_JSON)
	public Response updateItem(@Context HttpServletRequest request, @PathParam("id") String id, String content) {
		Response response = null;
		try (ItemManager itemManager = new ItemManager()) {
			Item dbItem = itemManager.load(id);
			Item updatedItem = Item.fromJSON(content);
			Item mergedItem = Item.copyValues(updatedItem, dbItem);
			final String mergedId = itemManager.merge(mergedItem);
			if (null != mergedId) {
				response = Response.ok().build();
			}
			else {
				throw new BadRequestException();
			}
			try (StatusManager statusMan = new StatusManager(); ThumbnailManager thumbMan = new ThumbnailManager()) {
				Status status = new Status();
				status.setStatusName(Status.StatusName.ITEM_UPDATE);
				statusMan.save(status);

				thumbMan.updateDirtyBits(id);
			}
		}
		return response;
	}

	@RolesAllowed({CoastalHazardsTokenBasedSecurityFilter.CCH_ADMIN_ROLE})
	@DELETE
	@Path("/{id}")
	public Response deleteItem(@Context HttpServletRequest request, @PathParam("id") String id) {
		Response response = null;
		try (ItemManager itemManager = new ItemManager()) {
			if (itemManager.delete(id)) {
				response = Response.ok().build();
			}
			else {
				throw new Error();
			}
			try (StatusManager statusMan = new StatusManager(); ThumbnailManager thumbMan = new ThumbnailManager()) {
				Status status = new Status();
				status.setStatusName(Status.StatusName.ITEM_UPDATE);
				statusMan.save(status);

				thumbMan.updateDirtyBits(id);
			}
		}
		return response;
	}

	/**
	 * Run the cycle check before attempting POST or PUT to verify item would
	 * not introduce cycle
	 *
	 * @param parentId aggregation item to check
	 * @param childId child item being added to parent item
	 * @return JSON response with true or false
	 */
	@GET
	@Path("/cycle/{parentId}/{childId}")
	public Response checkForCycle(@PathParam("parentId") String parentId, @PathParam("childId") String childId) {
		Response response = null;
		try (ItemManager itemManager = new ItemManager()) {
			boolean cycle = itemManager.isCycle(parentId, childId);
			response = Response.ok("{\"cycle\": " + cycle + "}", MediaType.APPLICATION_JSON_TYPE).build();
		}
		return response;
	}

	public static URI itemURI(Item item) {
		UriBuilder fromUri = UriBuilder.fromUri(PUBLIC_URL);
		URI uri = fromUri.path(DataURI.DATA_SERVICE_ENDPOINT + DataURI.ITEM_PATH)
				.path(item.getId()).build();
		return uri;
	}
}
