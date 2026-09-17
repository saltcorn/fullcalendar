/*jshint esversion: 8 */

const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const {
  stateFieldsToWhere,
  readState,
} = require("@saltcorn/data/plugin-helper");
const {
  eval_expression,
  jsexprToWhere,
} = require("@saltcorn/data/models/expression");
const { mergeIntoWhere } = require("@saltcorn/data/utils");
const moment = require("moment");
const {
  text,
  div,
  h3,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  code,
} = require("@saltcorn/markup/tags");

const { features } = require("@saltcorn/data/db/state");
const public_user_role = features?.public_user_role || 10;

const getColorOptions = async (fields) => {
  const result = [];
  for (const field of fields) {
    if (field.type.name === "Color") result.push(field.name);
    else if (field.is_fkey) {
      const reftable = Table.findOne({
        name: field.reftable_name,
      });
      const reffields = await reftable.getFields();
      reffields
        .filter((f) => f.type.name === "Color")
        .forEach((f) => result.push(`${field.name}.${f.name}`));
    }
  }
  return result;
};

const module_configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "License",
        blurb: "Select open source or premium license",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "enable_premium",
                type: "Bool",
                label: "Enable premium scheduler",
                default: false,
              },
              {
                name: "premium_license_key",
                type: "String",
                label: "Premium license key",
                showIf: { enable_premium: true },
              },
            ],
          });
        },
      },
    ],
  });

const configuration_workflow = (modconf) => (req) =>
  new Workflow({
    steps: [
      {
        name: "Event Configuration",
        blurb: "Attributes of the events to be displayed on the calendar.",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const expand_view_opts = expand_views.map((v) => v.name);

          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.every((sf) => !sf.required)
          );
          const create_view_opts = create_views.map((v) => v.name);

          const event_views = await View.find_table_views_where(
            context.table_id,
            ({ viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname &&
              viewtemplate?.name !== "Calendar" &&
              viewtemplate?.name !== "Edit"
          );
          const event_views_opts = event_views.map((v) => v.name);

          return new Form({
            fields: [
              {
                name: "title_field",
                label: "Event title field",
                type: "String",
                sublabel:
                  "A string for the event name displayed on the calendar.",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "String")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "start_field",
                label: "Start field",
                type: "String",
                sublabel: "A date field for when the event starts.",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "end_field",
                label: "End field",
                type: "String",
                sublabel: "A date field for when the event ends.",
                required: false,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name)
                    .join(),
                },
                showIf: { switch_to_duration: false },
              },
              {
                name: "duration_field",
                label: "Duration",
                type: "String",
                sublabel:
                  "An 'Int' or 'Float' field for the duration of the event.",
                required: false,
                attributes: {
                  options: fields
                    .filter(
                      (f) =>
                        f.name !== "id" &&
                        (f.type.name === "Integer" || f.type.name === "Float")
                    )
                    .map((f) => f.name)
                    .join(),
                },
                showIf: { switch_to_duration: true },
              },
              {
                name: "duration_units",
                label: "Duration units",
                type: "String",
                sublabel: "Units of duration field",
                required: false,
                attributes: {
                  options: "Seconds,Minutes,Hours,Days",
                },
                showIf: { switch_to_duration: true },
              },
              {
                name: "switch_to_duration",
                label: "Use duration instead",
                sublabel: "Use an event duration instead of an end date",
                type: "Bool",
                required: true,
              },
              {
                name: "allday_field",
                type: "String",
                label: "All-day field",
                sublabel:
                  "Boolean field to specify whether this is an all-day event.",
                required: false,
                attributes: {
                  options: [
                    ...fields
                      .filter((f) => f.type.name === "Bool")
                      .map((f) => f.name),
                    "Always",
                  ].join(),
                },
              },
              {
                name: "event_color",
                type: "String",
                label: "Event Color",
                sublabel: "A 'Color' field to set the color of this event.",
                required: false,
                attributes: {
                  options: await getColorOptions(fields),
                },
              },
              {
                name: "rrule_field",
                label: "Recurrence rule field",
                type: "String",
                sublabel: "A String field with RRule syntax",
                required: false,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "String")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "event_uid_field",
                label: "Event UID field",
                type: "String",
                sublabel:
                  "Optional. A String field holding the iCalendar UID, to prevent overriden recurrent event duplicates",
                required: false,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "String")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "include_fml",
                label: req.__("Row inclusion formula"),
                class: "validate-expression",
                sublabel:
                  req.__("Only include rows where this formula is true. ") +
                  req.__("In scope:") +
                  " " +
                  [
                    ...fields.map((f) => f.name),
                    "user",
                    "year",
                    "month",
                    "day",
                    "today()",
                  ]
                    .map((s) => code(s))
                    .join(", "),
                type: "String",
              },
              {
                name: "expand_view",
                label: "Expand View",
                sublabel:
                  "The view that opens when the user clicks on an event.",
                type: "String",
                required: false,
                attributes: {
                  options: expand_view_opts.join(),
                },
              },
              {
                name: "expand_display_mode",
                label: "Expand display mode",
                sublabel: "Open the 'expand view' via a link or a pop-up.",
                type: "String",
                attributes: {
                  options: ["link", "pop-up"],
                },
                required: true,
                default: "link",
                showIf: { expand_view: expand_view_opts },
              },
              {
                name: "reload_on_edit_in_pop_up",
                label: "Reload on edit",
                sublabel:
                  "After editing an event in a pop-up, reload the page. " +
                  "Otherwise, it updates only the calendar.",
                type: "Bool",
                default: false,
                showIf: {
                  expand_display_mode: "pop-up",
                },
              },
              {
                name: "view_to_create",
                label: "Use view to create",
                sublabel:
                  "View to create a new event. Leave blank to have no link to create a new item",
                type: "String",
                attributes: {
                  options: create_view_opts.join(),
                },
              },
              {
                name: "create_display_mode",
                label: "Create display mode",
                sublabel: "Open the 'create view' via a link or a pop-up.",
                type: "String",
                attributes: {
                  options: ["link", "pop-up"],
                },
                required: true,
                default: "link",
                showIf: { view_to_create: create_view_opts },
              },
              {
                name: "event_view",
                label: "Event view",
                sublabel:
                  "This view will be drawn on top of events instead of the default title. " +
                  "Please use a small view, preferably only with rudimental display elements. " +
                  "Overflows won't be shown.",
                type: "String",
                required: false,
                attributes: {
                  options: event_views_opts.join(),
                },
              },
              {
                name: "reload_on_drag_resize",
                label: "Reload on drag / resize",
                sublabel:
                  "After dropping or resizing an event, reload the page. " +
                  "Otherwise, it updates only the calendar.",
                type: "Bool",
                default: false,
              },
              {
                name: "progressive_load",
                label: "Progressive loading",
                type: "Bool",
              },
              ...(modconf?.enable_premium
                ? [
                    {
                      name: "resource_field",
                      label: "Resource field",
                      type: "String",
                      sublabel: "A field indicating resources",
                      required: false,
                      attributes: {
                        options: fields.map((f) => f.name),
                      },
                    },
                    {
                      name: "limit_resources",
                      label: "Limit resource by query",
                      type: "Bool",
                      sublabel: "",
                      showIf: { resource_field: fields.map((f) => f.name) },
                    },
                  ]
                : []),
            ],
          });
        },
      },
      {
        name: "Calendar Configuration",
        blurb: "Attributes of the calendar itself.",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "initialView",
                type: "String",
                label: "Initial calendar view",
                sublabel: modconf?.enable_premium
                  ? "The default calendar view shown when the calendar is loaded. Options: dayGridMonth,dayGridDay,dayGridWeek,timeGridWeek,timeGridDay,listDay,listWeek,listMonth,listYear,resourceTimeGridDay,resourceTimeline. Default: 'dayGridMonth'."
                  : "The default calendar view shown when the calendar is loaded. Options: dayGridMonth,dayGridDay,dayGridWeek,timeGridWeek,timeGridDay,listDay,listWeek,listMonth,listYear. Default: 'dayGridMonth'.",
                required: true,
                default: "dayGridMonth",
              },
              {
                name: "calendar_view_options",
                type: "String",
                label: "Calendar view options",
                sublabel:
                  "The view options displayed on the calendar. Separate the options with a comma for a button group, or with a space for separate buttons. Accepts the same options as above. Default: 'dayGridMonth,timeGridWeek,listMonth'.",
                required: true,
                default: "dayGridMonth,timeGridWeek,listMonth",
              },
              {
                name: "custom_calendar_views",
                type: "String",
                label: "Advanced: Custom calendar views",
                sublabel:
                  "Optionally define your own custom calendar views. Provide a FullCalendar views object. See https://github.com/saltcorn/fullcalendar/blob/main/README.md.",
                required: false,
                input_type: "code",
                attributes: { mode: "application/javascript" },
              },
              {
                name: "nowIndicator",
                type: "Bool",
                label: "Current time indicator",
                sublabel:
                  "Display a line to indicate the current time on day and week views",
                required: true,
                default: true,
              },
              {
                name: "weekNumbers",
                type: "Bool",
                label: "Week numbers",
                sublabel: "Display week numbers on the calendar",
                required: true,
                default: false,
              },
              {
                name: "default_event_color",
                type: "String",
                label: "Default event color",
                sublabel:
                  "The default color of calendar events. Accepts any valid CSS color value. Examples: #af2d8b, rgb(124, 0, 201), RoyalBlue.",
                required: true,
                default: "#4e73df",
              },
              {
                name: "limit_to_working_days",
                type: "Bool",
                label: "Limit to working days",
                sublabel:
                  "Only working days in week views. Filter out Saturday and Sunday in views designed for weeks (dayGridWeek, timeGridWeek).",
                required: false,
                default: false,
              },
              {
                name: "min_week_view_time",
                type: "String",
                label: "Min time in week view",
                sublabel: "Min time to display in timeGridWeek, e.g. 08:00",
                required: false,
              },
              {
                name: "max_week_view_time",
                type: "String",
                label: "Max time in week view",
                sublabel: "Max time to display in timeGridWeek, e.g. 20:00",
                required: false,
              },
              {
                name: "caldav_url",
                type: "String",
                label: "CalDAV URL",
                sublabel:
                  "Experimental. Also show events from this online calendar",
                required: false,
              },
            ],
          });
        },
      },
      {
        name: "Other Calendars",
        onlyWhen: async (context) => {
          const otherCalendars = (
            await View.find({ viewtemplate: "Calendar" })
          ).filter(
            (view) =>
              view.name !== context.viewname &&
              view.table_id !== context.table_id
          );
          return otherCalendars.length > 0;
        },
        form: async (context) => {
          const otherCalendars = (
            await View.find({ viewtemplate: "Calendar" })
          ).filter(
            (view) =>
              view.name !== context.viewname &&
              view.table_id !== context.table_id
          );
          return new Form({
            fields: otherCalendars.map((v) => ({ name: v.name, type: "Bool" })),
            validator: (values) => {
              const tableIds = new Set();
              for (const [name, val] of Object.entries(values)) {
                if (val === true) {
                  const view = View.findOne({ name: name });
                  if (view) {
                    if (tableIds.has(view.table_id))
                      return `The table of '${view.name}' is already in use.`;
                    else tableIds.add(view.table_id);
                  }
                }
              }
              return values;
            },
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = await table.getFields();
  return table_fields.map((f) => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};
const isPlainDate = (d) =>
  !!d &&
  typeof d === "object" &&
  d.constructor &&
  d.constructor.name === "PlainDate";
const asJsDate = (date) => (isPlainDate(date) ? date.toDate() : new Date(date));
const sameKindAs = (template, jsDate) =>
  isPlainDate(template) ? new template.constructor(jsDate) : jsDate;
function addSeconds(date, secs) {
  // adds seconds to date and returns new date
  const r = asJsDate(date);
  r.setSeconds(r.getSeconds() + secs);
  return sameKindAs(date, r);
}
const applyDelta = (old, delta) => {
  const msAsSecs = delta.milliseconds !== 0 ? delta.milliseconds / 1000 : 0;
  const daysAsSecs = 24 * 60 * 60 * delta.days;
  const newDate = asJsDate(old);
  newDate.setSeconds(newDate.getSeconds() + msAsSecs + daysAsSecs);
  if (delta.months !== 0) newDate.setMonth(newDate.getMonth() + delta.months);
  if (delta.years !== 0)
    newDate.setFullYear(newDate.getFullYear() + delta.years);
  return sameKindAs(old, newDate);
};
const localMidnight = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const valueForDateField = (fields, fieldName, instant, localStr) => {
  const field = fieldName && fields.find((f) => f.name === fieldName);
  if (!field || !field.attributes || !field.attributes.day_only) return instant;
  const day =
    typeof localStr === "string"
      ? (localStr.match(/^\d{4}-\d{2}-\d{2}/) || [])[0]
      : null;
  return day ? localMidnight(day) : null;
};
const isValidDate = (date) => {
  return (
    (date instanceof Date && !isNaN(date)) ||
    (isPlainDate(date) && date.isValid())
  );
};
const unitSeconds = (duration_units) => {
  //number of seconds per unit- ie if the duration unit is 1 minute, this is 60 seconds. multiply by duration to get length of event in seconds.
  return duration_units === "Seconds"
    ? 1
    : duration_units === "Minutes"
    ? 60
    : duration_units === "Days"
    ? 24 * 60 * 60
    : 60 * 60;
};
const isEmptyDelta = (delta) => {
  return delta
    ? delta.years === 0 &&
        delta.months === 0 &&
        delta.days === 0 &&
        delta.milliseconds === 0
    : true;
};
const buildJoinFields = (event_color) => {
  return event_color && event_color.includes(".")
    ? {
        _color: {
          ref: event_color.split(".")[0],
          target: event_color.split(".")[1],
        },
      }
    : {};
};
const eventFromRow = async (
  row,
  table,
  alwaysAllDay,
  transferedState,
  eventView,
  req,
  {
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_field,
    duration_units,
    switch_to_duration,
    title_field,
    event_color,
    rrule_field,
    resource_field,
    event_uid_field,
  },
  overrideMap
) => {
  const unitSecs = unitSeconds(duration_units);
  const duration_in_seconds = row[duration_field] * unitSecs; //duration in seconds = duration * unit
  const end_by_duration = addSeconds(row[start_field], duration_in_seconds); //add duration in seconds to start time
  const start = row[start_field]; //start = start field
  const allDay = alwaysAllDay || row[allday_field]; //if allday field is "always", allday=true, otherwise use value
  const end = switch_to_duration ? end_by_duration : row[end_field]; // if using duration, show end by duration. otherwise, use end field value.
  const pk = table.pk_name;
  const url = expand_view
    ? `/view/${expand_view}?${pk}=${encodeURIComponent(row[pk])}${
        transferedState || ""
      }`
    : undefined; //url to go to when the event is clicked
  const color =
    row[event_color && event_color.includes(".") ? "_color" : event_color]; // color of the event: uses a table field or the joined '_color' field
  const id = row.id;
  const eventHtml = eventView
    ? `<div style="overflow: hidden;">
        ${url ? `<a href="${url}" class="decoration-none">` : ""}
          ${await eventView.run({ [pk]: row[pk] }, { req })}
          ${url ? "</a>" : ""}
      </div>`
    : undefined;
  const ev = {
    title: row[title_field],
    tableId: table.id,
    start,
    allDay,
    end,
    url,
    color,
    id,
    eventHtml,
  };
  if (rrule_field && row[rrule_field]) {
    let rruleStr = row[rrule_field];
    if (
      event_uid_field &&
      row[event_uid_field] &&
      overrideMap &&
      overrideMap.has(row[event_uid_field])
    ) {
      const exdates = overrideMap
        .get(row[event_uid_field])
        .map((d) => moment(asJsDate(d)).utc().format("YYYYMMDDTHHmmSS") + "Z")
        .join(",");
      if (exdates) rruleStr = `${rruleStr}\nEXDATE:${exdates}`;
    }
    ev.rrule = `DTSTART:${moment(asJsDate(start)).format(
      "YYYYMMDDTHHmmSS"
    )}\n${rruleStr}`;
    ev.duration =
      start?.getTime && end?.getTime
        ? end.getTime() - start.getTime()
        : undefined;
  }
  if (resource_field) {
    ev.resourceId = row[resource_field];
  }
  return ev;
};
const buildTransferedState = (fields, state, excluded) => {
  return fields && state
    ? Object.keys(state)
        .filter(
          (k) =>
            k !== "id" &&
            fields.find((f) => f.name === k) &&
            (excluded ? excluded.indexOf(k) < 0 : true)
        )
        .map((k) => `&${encodeURIComponent(k)}=${encodeURIComponent(state[k])}`)
        .join("")
    : "";
};
const durationIsFloat = (fields, duration_field) => {
  const field = fields.find((f) => f.name === duration_field);
  if (!field) return false;
  else return field.type.name === "Float";
};

// Build a map { uid -> [override_start_date,...] } from a result set.
// Only rows without a recurrence rule but with a UID are treated as overrides
// of a matching series row (same UID, has a recurrence rule).
const buildOverrideMap = (rows, event_uid_field, rrule_field, start_field) => {
  const map = new Map();
  if (!event_uid_field || !rrule_field || !start_field) return map;
  for (const r of rows) {
    const uid = r[event_uid_field];
    if (!uid) continue;
    if (!r[rrule_field] && r[start_field]) {
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid).push(r[start_field]);
    }
  }
  return map;
};

const addOtherCalendars = async (
  events,
  otherCalendars,
  req,
  state,
  transferedState
) => {
  for (const otherCalendar of otherCalendars) {
    const { table_id, configuration } = otherCalendar;
    const table = await Table.findOne({ id: table_id });
    const fields = await table.getFields();
    readState(state, fields);
    const qstate = await stateFieldsToWhere({ fields, state });
    const rows = await table.getJoinedRows({
      where: qstate,
      joinFields: buildJoinFields(configuration.event_color),
    });
    const alwaysAllDay = configuration.allday_field === "Always";
    const eventView = configuration.event_view
      ? await View.findOne({ name: configuration.event_view })
      : undefined;
    const subOverrideMap = buildOverrideMap(
      rows,
      configuration.event_uid_field,
      configuration.rrule_field,
      configuration.start_field
    );
    const otherEvents = await Promise.all(
      rows.map((row) =>
        eventFromRow(
          row,
          table,
          alwaysAllDay,
          transferedState,
          eventView,
          req,
          configuration,
          subOverrideMap
        )
      )
    );
    events.push(...otherEvents);
  }
};

const run =
  (modcfg) => async (table_id, viewname, config, state, extraArgs) => {
    const {
      view_to_create,
      expand_view,
      start_field,
      allday_field,
      end_field,
      duration_units,
      duration_field,
      switch_to_duration,
      title_field,
      nowIndicator,
      weekNumbers,
      initialView,
      default_event_color,
      calendar_view_options,
      custom_calendar_views,
      event_color,
      limit_to_working_days,
      min_week_view_time,
      max_week_view_time,
      expand_display_mode,
      create_display_mode,
      reload_on_edit_in_pop_up,
      event_view,
      reload_on_drag_resize,
      include_fml,
      caldav_url,
      rrule_field,
      progressive_load,
      resource_field,
      limit_resources,
      ...rest
    } = config;
    const table = await Table.findOne({ id: table_id });
    const fields = await table.getFields();
    readState(state, fields);

    let events = [];
    if (!progressive_load) {
      const where = await stateFieldsToWhere({ fields, state });

      if (include_fml) {
        const ctx = {
          ...state,
          user_id: extraArgs.req.user?.id || null,
          user: extraArgs.req.user,
        };
        let where1 = jsexprToWhere(include_fml, ctx, fields);
        mergeIntoWhere(where, where1 || {});
      }

      events = await get_events(
        table,
        viewname,
        config,
        state,
        extraArgs,
        where
      );
    }

    const id = `cal${Math.round(Math.random() * 100000)}`;
    const weekends = limit_to_working_days ? false : true; // fullcalendar flag to filter out weekends
    // parse min/max times or use defaults
    const minAsDate = new Date(`1970-01-01T${min_week_view_time}`);
    const maxAsDate = new Date(`1970-01-01T${max_week_view_time}`);
    const minIsValid = isValidDate(minAsDate);
    const minTime = minIsValid ? minAsDate.toTimeString() : "00:00:00";
    const maxIsValid = isValidDate(maxAsDate);
    const maxTime = maxIsValid ? maxAsDate.toTimeString() : "24:00:00";
    const alwaysAllDay = allday_field === "Always";
    const transferedState = buildTransferedState(fields, state);
    const excluded = [start_field];
    if (end_field) excluded.push(end_field);
    const transferedSelectState = buildTransferedState(fields, state, excluded);
    let resources;
    if (resource_field) {
      const field = fields.find((f) => f.name === resource_field);
      if (field.is_fkey) {
        const table = Table.findOne(field.reftable_name);
        const rows = limit_resources
          ? await table.getRows({
              [table.pk_name]: Array.isArray(state[resource_field])
                ? { or: state[resource_field] }
                : state[resource_field],
            })
          : await table.getRows();

        resources = rows.map((r) => ({
          id: r[table.pk_name],
          title: r[field.attributes.summary_field],
        }));
      }
    }
    // console.log({ modcfg });

    return (
      (caldav_url
        ? script({
            defer: true,
            src: `/plugins/public/fullcalendar@${
              require("./package.json").version
            }/caldav.js`,
          })
        : "") +
      (rrule_field
        ? script({
            defer: true,
            src: `/plugins/public/fullcalendar@${
              require("./package.json").version
            }/rrule.min.js`,
          }) +
          script({
            defer: true,
            src: `/plugins/public/fullcalendar@${
              require("./package.json").version
            }/fc-rrule.min.js`,
          })
        : "") +
      div(
        script(
          domReady(`
  var calendarEl = document.getElementById('${id}');

  const locale =
    navigator.userLanguage ||
    (navigator.languages &&
      navigator.languages.length &&
      navigator.languages[0]) ||
    navigator.language ||
    navigator.browserLanguage ||
    navigator.systemLanguage ||
    "en";
  const timeGridWeekOpts = {
    weekends: ${weekends},
    slotMinTime: "${minTime}",
    slotMaxTime: "${maxTime}",
  };
  const dayGridWeekOpts = {
    weekends: ${weekends},
  };
  const alwaysAllday = ${alwaysAllDay};
  const isResizeable = ${
    switch_to_duration
      ? duration_field
        ? true
        : false
      : end_field
      ? true
      : false
  };
  const hasTimeFilter = ${maxIsValid || minIsValid};
  const hasWeekendFilter = ${!weekends};
  let timeGridFilterActive = true;
  let dayGridFilterActive = true;
  const expandInPopup = ${expand_display_mode === "pop-up"};
  const createInPopup = ${create_display_mode === "pop-up"};
  function addOverflowHidden() {
    $(".fc-event-main:not([class*='overflow-hidden'])").addClass("overflow-hidden"); 
  }
  ${
    switch_to_duration && duration_field
      ? `
  function durationFromInfo(info) {
    const isFloat = ${durationIsFloat(fields, duration_field)};
    const startAsDate = new Date(info.startStr);
    const endAsDate = new Date(info.endStr);
    const result = (endAsDate - startAsDate) / 1000 / ${unitSeconds(
      duration_units
    )};
    return isFloat ? result : Math.trunc(result);
  }`
      : ""
  }
  var applyShowifRequested = false;
  function requestApplyShowif() {
    if(applyShowifRequested) return;
    applyShowifRequested = true;
    setTimeout(function() { 
      applyShowifRequested = false;
      apply_showif();
    }, 200)
  }
  var calendar = new FullCalendar.Calendar(calendarEl, {
    ${caldav_url ? `plugins: [CalDavPlugin],` : ""}
    eventContent: function(arg) {
      if (!arg.event.extendedProps?.eventHtml) return true;
      else return { html: arg.event.extendedProps.eventHtml };
    },
    ${
      modcfg?.enable_premium && modcfg?.premium_license_key
        ? `schedulerLicenseKey: '${modcfg.premium_license_key}',`
        : ""
    }
    datesSet: (info) => {
      let filterBtn = "";
      if (
        info.view.type === "timeGridWeek" && 
        (hasTimeFilter || hasWeekendFilter)
      ) {
        filterBtn = timeGridFilterActive ? " disableFilter" : " enableFilter";
      }
      else if (info.view.type === "dayGridWeek" && hasWeekendFilter) {
        filterBtn = dayGridFilterActive ? " disableFilter" : " enableFilter";
      }      
      const toolbar = calendar.getOption("headerToolbar");
      toolbar.left = "prev,next today${
        view_to_create ? " add" : ""
      }" + filterBtn;
      calendar.setOption("headerToolbar", toolbar);
      addOverflowHidden();
    },
    ${resources ? `resources: ${JSON.stringify(resources)},` : ""}
    locale: locale,
    timeZone: "local",
    headerToolbar: {
      left: 'prev,next today${view_to_create ? " add" : ""}',
      center: 'title',
      right: '${calendar_view_options}',
    },    
    navLinks: true,
    initialView: '${initialView}',
    nowIndicator: ${nowIndicator},
    weekNumbers: ${weekNumbers},
    eventColor: '${default_event_color}',
    customButtons: {
      ${
        view_to_create
          ? `
      add: {
        text: 'add',
        click: function() {
          const newHref = '/view/${view_to_create}${
              transferedState ? "?" + transferedState.substring(1) : ""
            }';
          if (createInPopup) ajax_modal(newHref);
          else location.href = newHref;
        }
      },
      `
          : ""
      }
      ${
        maxIsValid || minIsValid || !weekends
          ? `
      disableFilter: {
        text: "show all times",
        click: function() {
          // update view
          const currentView = calendar.currentData.currentViewType;
          const viewOpts = calendar.getOption("views");
          if(currentView === "timeGridWeek") {
            viewOpts.timeGridWeek.slotMinTime = "00:00:00";
            viewOpts.timeGridWeek.slotMaxTime = "24:00:00";
            viewOpts.timeGridWeek.weekends = true;
            timeGridFilterActive = false;
          }
          else if (currentView === "dayGridWeek") {
            viewOpts.dayGridWeek.weekends = true;
            dayGridFilterActive = false;
          }
          calendar.setOption("views", viewOpts);
          // update toolbar
          const toolbar = calendar.getOption("headerToolbar");
          toolbar.left = "prev,next today${
            view_to_create ? " add" : ""
          } enableFilter";
          calendar.setOption("headerToolbar", toolbar);
        },
      },
      enableFilter: {
        text: "only working times",
        click: function() {
          // update view
          const currentView = calendar.currentData.currentViewType;
          if (currentView === "timeGridWeek")
            timeGridFilterActive = true;
          else if(currentView === "dayGridWeek")
            dayGridFilterActive = true;
          const viewOpts = calendar.getOption("views");
          if (hasTimeFilter && currentView === "timeGridWeek") {
            viewOpts.timeGridWeek.slotMinTime = "${minTime}";
            viewOpts.timeGridWeek.slotMaxTime = "${maxTime}";
          }
          if (hasWeekendFilter) {
            if (currentView === "timeGridWeek")
              viewOpts.timeGridWeek.weekends = false;
            else if (currentView === "dayGridWeek")
              viewOpts.dayGridWeek.weekends = false;
          }
          calendar.setOption("views", viewOpts);
          // update toolbar
          const toolbar = calendar.getOption("headerToolbar");
          toolbar.left = "prev,next today${
            view_to_create ? " add" : ""
          } disableFilter";
          calendar.setOption("headerToolbar", toolbar);
        },
      },
    `
          : ""
      }
    },
    ${
      view_to_create
        ? `
    selectable: true,
    select: function(info) {
      let url = '/view/${view_to_create}?${start_field}=' + encodeURIComponent(info.startStr) ${
            end_field
              ? `+ '&` + end_field + `=' + encodeURIComponent(info.endStr)`
              : ""
          }
      ${
        switch_to_duration && duration_field
          ? `+ '&` + duration_field + `=' + durationFromInfo(info)`
          : ""
      }
      ${"+" + `'${transferedSelectState}'`};

      if (createInPopup) ajax_modal(url);
      else location.href = url;
    },`
        : ""
    }

    events: ${
      progressive_load
        ? `(info, successCallback, failureCallback) =>{
      const dataObj = {
         info,
         state: ${JSON.stringify(state)}
      }
      view_post('${viewname}', 'ajax_load_events', dataObj,
          (res) => {
            //console.log("ajax resp", res.length)
            successCallback(res)
            })
      
      }`
        : JSON.stringify(events)
    },
    ${
      caldav_url
        ? `eventSources: [      
      {
        url: "${caldav_url}",
        format: "caldav",        
    }],`
        : ""
    }
    editable: true, 
    eventResizableFromStart: isResizeable,
    eventDurationEditable: isResizeable,
    eventResize: (info) => {
      const rowId = info.event.id;
      const dataObj = { 
        rowId, start: info.event.start, end: info.event.end, 
        startStr: info.event.startStr, endStr: info.event.endStr,
        tableId: info.event.extendedProps.tableId,
      };
      view_post('${viewname}', 'update_calendar_event', dataObj,
        (res) => {
      ${
        reload_on_drag_resize
          ? `
          location.reload();`
          : `
          if(res.error) info.revert();
          else if (res.newEvent) {
            info.event.remove();
            const newEvent = res.newEvent;
            newEvent.url = info.oldEvent.url;
            calendar.addEvent(newEvent);
            addOverflowHidden();
          }`
      }
        }
      );
    },
    eventDrop: (info) => {
      if (alwaysAllday && !info.event.allDay) {
        notifyAlert({ 
          type: "danger", 
          text: "Setting a time is not allowed when 'All-day' is set to 'Always'.",
        });
        info.revert();
        addOverflowHidden();
      }
      else {
        const rowId = info.event.id;
        const dataObj = { 
          rowId, delta: info.delta, allDay: info.event.allDay, 
          start: info.event.start, end: info.event.end,
          startStr: info.event.startStr, endStr: info.event.endStr,
          tableId: info.event.extendedProps.tableId,
        };
        view_post('${viewname}', 'update_calendar_event', dataObj,
          (res) => {
        ${
          reload_on_drag_resize
            ? `
            location.reload();`
            : `
            if(res.error) info.revert();
            else if (res.newEvent) {
              info.event.remove();
              const newEvent = res.newEvent;
              newEvent.url = info.oldEvent.url;
              calendar.addEvent(newEvent);
              addOverflowHidden();
            }`
        }
          }
        );
      }
    },
    eventDidMount: requestApplyShowif,
    eventClick: (info) => {
      if (expandInPopup && info.event.url) {
        info.jsEvent.preventDefault(); // don't let the browser navigate
        const opts = ${
          reload_on_edit_in_pop_up
            ? "{ submitReload: true }"
            : `{
          submitReload: false,
          onClose: () => {
            $.ajax("/view/${viewname}/load_calendar_event", {
              dataType: "json",
              type: "POST",
              headers: {
                "CSRF-Token": _sc_globalCsrf,
              },
              data: {
                rowId: info.event.id,
                tableId: info.event.extendedProps.tableId,
              },
            })
            .done((res) => {
              const updated = res.newEvent;
              updated.url = info.event.url;
              info.event.remove();
              $("#scmodal").remove();
              calendar.addEvent(updated);
              addOverflowHidden();
            })
            .fail((res) => {
              notifyAlert({ 
                type: "danger", 
                text: "An error occurred",
              });
            });
          },
        }`
        };
        ajax_modal(info.event.url, opts);
      }
    },
    views: {
      dayGridWeek: dayGridWeekOpts,
      timeGridWeek: timeGridWeekOpts,
      ${custom_calendar_views ? custom_calendar_views + "," : ""}
    },
  });
  calendar.render();`)
        ),
        div({ id })
      )
    );
  };
/*
 * internal helper to build a response with the updated event
 */
const buildResponse = async (
  table,
  rowId,
  req,
  {
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_field,
    duration_units,
    switch_to_duration,
    title_field,
    event_color,
    event_view,
    resource_field,
    rrule_field,
  }
) => {
  const updatedRow = await table.getJoinedRows({
    where: { id: rowId },
    joinFields: buildJoinFields(event_color),
  });
  const eventView = event_view
    ? await View.findOne({ name: event_view })
    : undefined;
  return {
    json: {
      newEvent: await eventFromRow(
        updatedRow[0],
        table,
        allday_field === "Always",
        undefined,
        eventView,
        req,
        {
          expand_view,
          start_field,
          allday_field,
          end_field,
          duration_field,
          duration_units,
          switch_to_duration,
          title_field,
          event_color,
          rrule_field,
          resource_field,
        }
      ),
    },
  };
};

const get_events = async (
  table,
  viewname,
  {
    view_to_create,
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_units,
    duration_field,
    switch_to_duration,
    title_field,
    nowIndicator,
    weekNumbers,
    initialView,
    default_event_color,
    calendar_view_options,
    custom_calendar_views,
    event_color,
    limit_to_working_days,
    min_week_view_time,
    max_week_view_time,
    expand_display_mode,
    create_display_mode,
    reload_on_edit_in_pop_up,
    event_view,
    reload_on_drag_resize,
    include_fml,
    caldav_url,
    rrule_field,
    event_uid_field,
    progressive_load,
    resource_field,
    ...rest
  },
  state,
  extraArgs,
  where
) => {
  const fields = await table.getFields();

  const rows = await table.getJoinedRows({
    where,
    joinFields: buildJoinFields(event_color),
  });

  const overrideMap = buildOverrideMap(
    rows,
    event_uid_field,
    rrule_field,
    start_field
  );

  const otherCalendars = (await View.find({ viewtemplate: "Calendar" })).filter(
    (view) => view.name !== viewname && rest[view.name]
  );
  // parse min/max times or use defaults
  const alwaysAllDay = allday_field === "Always";
  const transferedState = buildTransferedState(fields, state);
  const excluded = [start_field];
  if (end_field) excluded.push(end_field);
  const eventView = event_view
    ? await View.findOne({ name: event_view })
    : undefined;
  const events = await Promise.all(
    rows.map((row) =>
      eventFromRow(
        row,
        table,
        alwaysAllDay,
        transferedState,
        eventView,
        extraArgs.req,
        {
          expand_view,
          start_field,
          allday_field,
          end_field,
          duration_field,
          duration_units,
          switch_to_duration,
          title_field,
          event_color,
          rrule_field,
          resource_field,
          event_uid_field,
        },
        overrideMap
      )
    )
  );
  await addOtherCalendars(
    events,
    otherCalendars,
    extraArgs.req,
    state,
    transferedState
  );
  return events;
};

/*
 * service to load a calendar event from the db
 */
const load_calendar_event = async (
  unusedTableID, // use tableId for multi table support
  viewname,
  config,
  { rowId, tableId },
  { req }
) => {
  const table = await Table.findOne({ id: tableId });
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (role > table.min_role_write) {
    return { json: { error: req.__("Not authorized") } };
  }
  return await buildResponse(table, rowId, req, config);
};

const ajax_load_events = async (
  table_id, // use tableId for multi table support
  viewname,
  config,
  { info, state },
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  const where = await stateFieldsToWhere({ fields, state });

  if (config.include_fml) {
    const ctx = {
      ...state,
      user_id: extraArgs.req.user?.id || null,
      user: extraArgs.req.user,
    };
    let where1 = jsexprToWhere(config.include_fml, ctx, fields);
    mergeIntoWhere(where, where1 || {});
  }
  let where2 = { ...where };

  if (info.start && info.end && config.rrule_field) {
    where2 = {
      or: [
        {
          [config.end_field]: { gt: new Date(info.start) },
          [config.start_field]: { lt: new Date(info.end) },
          ...where,
        },
        { not: { [config.rrule_field]: null }, ...where },
      ],
    };
  } else if (info.start && info.end) {
    where2 = {
      [config.end_field]: { gt: new Date(info.start) },
      [config.start_field]: { lt: new Date(info.end) },
      ...where,
    };
  }
  //console.log({ state });

  const events = await get_events(
    table,
    viewname,
    config,
    state,
    extraArgs,
    where2
  );

  return { json: events };
};
/*
 * service to update a calendar event in the db
 */
const update_calendar_event = async (
  unusedTableID, // use tableId for multi table support
  viewname,
  {
    start_field,
    end_field,
    duration_units,
    duration_field,
    switch_to_duration,
    allday_field,
    expand_view,
    title_field,
    event_color,
    event_view,
    resource_field,
    rrule_field,
  },
  { rowId, tableId, delta, allDay, start, end, startStr, endStr },
  { req }
) => {
  const table = await Table.findOne({ id: tableId });
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (role > table.min_role_write) {
    return { json: { error: req.__("Not authorized") } };
  }
  const fields = await table.getFields();
  if (
    switch_to_duration &&
    duration_field &&
    fields &&
    !fields.find((field) => field.name === duration_field)
  ) {
    return { json: { error: req.__("The duration column does not exist.") } };
  }
  const row = await table.getRow({ id: rowId });
  let updateVals = {};
  let allDayChanged = false;
  if (
    allday_field &&
    allday_field !== "Always" &&
    allDay !== undefined &&
    row[allday_field] !== allDay
  ) {
    updateVals[allday_field] = allDay;
    allDayChanged = true;
  }
  const startAsDate = start ? new Date(start) : null;
  const endAsDate = end ? new Date(end) : null;
  const newStart = valueForDateField(
    fields,
    start_field,
    startAsDate,
    startStr
  );
  if (
    isValidDate(newStart) &&
    (!row[start_field] || newStart.getTime() !== row[start_field].getTime())
  )
    updateVals[start_field] = newStart;
  if (switch_to_duration) {
    const isFloat = duration_field && durationIsFloat(fields, duration_field);
    if (isValidDate(endAsDate) && isValidDate(startAsDate)) {
      const unitSecs = unitSeconds(duration_units);
      const floatDuration = (endAsDate - startAsDate) / 1000 / unitSecs;
      const newDuration = isFloat ? floatDuration : Math.trunc(floatDuration);
      const oldDuration = row[duration_field];
      if (
        (!isFloat && newDuration !== oldDuration) ||
        (isFloat && Math.abs(newDuration - oldDuration) > Number.EPSILON)
      )
        updateVals[duration_field] = newDuration;
    }
  } else if (end_field) {
    const newEnd = valueForDateField(fields, end_field, endAsDate, endStr);
    if (isValidDate(newEnd)) updateVals[end_field] = newEnd;
    else if (allDayChanged && !isEmptyDelta(delta))
      updateVals[end_field] = applyDelta(row[end_field], delta);
  }
  if (Object.keys(updateVals).length !== 0)
    await table.updateRow(updateVals, rowId, req.user);
  return await buildResponse(table, rowId, req, {
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_field,
    duration_units,
    switch_to_duration,
    title_field,
    event_color,
    event_view,
    rrule_field,
    resource_field,
  });
};
const headers = (opts) => [
  {
    headerTag: `
    <style> 
      div.fc a { color: inherit; } 
      .decoration-none:hover { text-decoration: none; }
    </style>`,
  },
  ...(opts?.enable_premium
    ? [
        {
          script: `/plugins/public/fullcalendar@${
            require("./package.json").version
          }/premium-main.min.js`,
          onlyViews: ["Calendar"],
        },
      ]
    : [
        {
          script: `/plugins/public/fullcalendar@${
            require("./package.json").version
          }/index.global.min.js`,
          onlyViews: ["Calendar"],
        },
      ]),
  {
    script: `/plugins/public/fullcalendar@${
      require("./package.json").version
    }/locales-all.min.js`,
    onlyViews: ["Calendar"],
  },
];
const connectedObjects = async ({
  viewname,
  expand_view,
  expand_display_mode,
  view_to_create,
  create_display_mode,
  ...rest
}) => {
  let result = { embeddedViews: [], linkedViews: [], tables: [] };
  const addWithMode = (viewName, mode) => {
    const view = View.findOne({ name: viewName });
    if (view) {
      switch (mode) {
        case "link":
          result.linkedViews.push(view);
          break;
        case "pop-up":
          result.embeddedViews.push(view);
          break;
      }
    }
  };
  const handleCalendarCfg = (configuration) => {
    if (configuration.expand_view)
      addWithMode(configuration.expand_view, configuration.expand_display_mode);
    if (configuration.view_to_create)
      addWithMode(
        configuration.view_to_create,
        configuration.create_display_mode
      );
  };
  handleCalendarCfg({
    expand_view,
    expand_display_mode,
    view_to_create,
    create_display_mode,
  });
  const otherCalendars = (await View.find({ viewtemplate: "Calendar" })).filter(
    (view) => view.name !== viewname && rest[view.name]
  );
  for (const otherCalendar of otherCalendars) {
    if (otherCalendar.configuration)
      handleCalendarCfg(otherCalendar.configuration);
    const otherTable = Table.findOne({ id: otherCalendar.table_id });
    if (otherTable) result.tables.push(otherTable);
  }
  return result;
};
module.exports = {
  sc_plugin_api_version: 1,
  headers,
  plugin_name: "fullcalendar",
  configuration_workflow: module_configuration_workflow,

  viewtemplates: (modcfg) => [
    {
      name: "Calendar",
      description:
        "Displays items on a calendar, with options for month, week, agenda, and others.",
      display_state_form: false,
      get_state_fields,
      configuration_workflow: configuration_workflow(modcfg),
      run: run(modcfg),
      routes: { update_calendar_event, load_calendar_event, ajax_load_events },
      connectedObjects,
    },
  ],
};
