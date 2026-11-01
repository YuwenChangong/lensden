import type { ResolvedLocale } from "../locale.ts";

const copyPairs = {
  "actionApplied": ["已执行{value0}。","Applied {value0}."],
  "reasonCategoryValue": ["原因分类：{value0}","Reason category: {value0}"],
  "noteValue": ["备注：{value0}","Note: {value0}"],
  "actionTargetValue": ["处理对象：{value0}","Action target: {value0}"],
  "reportTargetValue": ["举报对象：{value0} · {value1}","Report target: {value0} · {value1}"],
  "reportIdValue": ["举报编号：{value0}","Report ID: {value0}"],
  "currentStatusValue": ["当前状态：{value0}","Current status: {value0}"],
  "actionImpactValue": ["动作影响：{value0}","Action impact: {value0}"],
  "reversibilityValue": ["可逆性：{value0}","Reversibility: {value0}"],
  "targetUserValue": ["目标用户：{value0} · {value1}","Target user: {value0} · {value1}"],
  "handlingNoteValue": ["处理备注：{value0}","Handling note: {value0}"],
  "suspensionExpiryValue": ["暂停到期：{value0}","Suspension expiry: {value0}"],
  "statusValue": ["状态：{value0}","Status: {value0}"],
  "targetValue": ["对象：{value0}","Target: {value0}"],
  "reasonValue": ["原因：{value0}","Reason: {value0}"],
  "priorityValue": ["优先级：{value0}","Priority: {value0}"],
  "searchValue": ["搜索：{value0}","Search: {value0}"],
  "openReportsCount": ["同目标待处理 {value0} 条","{value0} open reports for this target"],
  "mediaDeletedWarning": ["媒体已删除，带警告：{value0}","Media deleted with warning: {value0}"],
  "validJsonRequired": ["{value0} 必须是有效 JSON。","{value0} must be valid JSON."],
  "circleCoverAlt": ["{value0} 圈子封面","{value0} circle cover"],
  "circlePurgeSummary": ["帖子: {value0} · 举报记录: {value1} · 封面: {value2}{value3}","Posts: {value0} · Reports: {value1} · Cover: {value2}{value3}"],
  "targetNameValue": ["目标：{value0}","Target: {value0}"],
  "enterCircleNameValue": ["输入圈子名称以确认：{value0}","Enter the circle name to confirm: {value0}"],
  "noUserSelected": [
    "未选择用户",
    "No user selected"
  ],
  "warned": [
    "已警告",
    "Warned"
  ],
  "suspended": [
    "已暂停",
    "Suspended"
  ],
  "banned": [
    "已封禁",
    "Banned"
  ],
  "active": [
    "正常",
    "Active"
  ],
  "youCannotApplyThisActionToYourOwnAdministrator": [
    "不能对自己的管理员账号执行该操作。",
    "You cannot apply this action to your own administrator account."
  ],
  "enterAReason": [
    "请填写原因。",
    "Enter a reason."
  ],
  "enterTheSuspensionExpiry": [
    "请填写暂停截止时间。",
    "Enter the suspension expiry."
  ],
  "invalidSuspensionExpiry": [
    "暂停截止时间格式无效。",
    "Invalid suspension expiry."
  ],
  "theSuspensionExpiryMustBeInTheFuture": [
    "暂停截止时间必须晚于当前时间。",
    "The suspension expiry must be in the future."
  ],
  "thisUserIsAlreadyBanned": [
    "该用户已经处于封禁状态。",
    "This user is already banned."
  ],
  "thisUserIsAlreadySuspended": [
    "该用户已经处于暂停状态。",
    "This user is already suspended."
  ],
  "thisUserHasNoSuspensionOrBanToRemove": [
    "该用户当前没有 suspend / ban 限制。",
    "This user has no suspension or ban to remove."
  ],
  "thisActionIsUnavailableInTheCurrentState": [
    "当前状态不适合执行该操作。",
    "This action is unavailable in the current state."
  ],
  "warn": [
    "警告",
    "Warn"
  ],
  "suspend": [
    "暂停",
    "Suspend"
  ],
  "ban": [
    "封禁",
    "Ban"
  ],
  "liftRestriction": [
    "解除",
    "Lift restriction"
  ],
  "addStrike": [
    "加 strike",
    "Add strike"
  ],
  "removeStrike": [
    "减 strike",
    "Remove strike"
  ],
  "note": [
    "备注",
    "Note"
  ],
  "administrator": [
    "管理员",
    "Administrator"
  ],
  "failedToLoadUsers": [
    "加载用户列表失败",
    "Failed to load users"
  ],
  "failedToLoadSafetyDetails": [
    "加载安全详情失败",
    "Failed to load safety details"
  ],
  "actionFailed": [
    "操作失败",
    "Action failed"
  ],
  "userSafetyConsole": [
    "用户安全控制台",
    "User safety console"
  ],
  "searchUsersInspectSafetyStatusAndManageWarningsSuspensions": [
    "搜索用户、查看安全状态，并执行 warning / suspend / ban / unban。",
    "Search users, inspect safety status, and manage warnings, suspensions and bans."
  ],
  "searchUsernameOrDisplayName": [
    "搜索用户名或昵称",
    "Search username or display name"
  ],
  "search": [
    "搜索",
    "Search"
  ],
  "loadingUsers": [
    "正在加载用户列表...",
    "Loading users..."
  ],
  "noUsersFound": [
    "没有找到用户",
    "No users found"
  ],
  "role": [
    "· 角色",
    " · Role "
  ],
  "selectAUser": [
    "请选择一个用户",
    "Select a user."
  ],
  "viewPublicProfile": [
    "查看公开资料",
    "View public profile"
  ],
  "suspendedUntil": [
    "暂停至：",
    "Suspended until: "
  ],
  "reason": [
    "原因：",
    "Reason: "
  ],
  "eventHistory": [
    "事件历史",
    "Event history"
  ],
  "administratorActionsNewestFirst": [
    "按时间倒序显示管理员动作。",
    "Administrator actions, newest first."
  ],
  "loadingSafetyDetails": [
    "正在加载安全详情...",
    "Loading safety details..."
  ],
  "noEventsYet": [
    "还没有事件记录",
    "No events yet"
  ],
  "performedBy": [
    "执行人：",
    "Performed by: "
  ],
  "user": [
    "用户",
    "User"
  ],
  "enterAReason2": [
    "填写原因",
    "Enter a reason"
  ],
  "cancel": [
    "取消",
    "Cancel"
  ],
  "processing": [
    "处理中...",
    "Processing..."
  ],
  "confirm": [
    "确认",
    "Confirm"
  ],
  "allStatuses": [
    "全部状态",
    "All statuses"
  ],
  "open": [
    "待处理",
    "Open"
  ],
  "inReview": [
    "处理中",
    "In review"
  ],
  "actioned": [
    "已处理",
    "Actioned"
  ],
  "dismissed": [
    "已驳回",
    "Dismissed"
  ],
  "allTargets": [
    "全部对象",
    "All targets"
  ],
  "post": [
    "帖子",
    "Post"
  ],
  "comment": [
    "评论",
    "Comment"
  ],
  "circle": [
    "圈子",
    "Circle"
  ],
  "allPriorities": [
    "全部优先级",
    "All priorities"
  ],
  "low": [
    "低",
    "Low"
  ],
  "normal": [
    "普通",
    "Normal"
  ],
  "high": [
    "高",
    "High"
  ],
  "allReasons": [
    "全部原因",
    "All reasons"
  ],
  "spam": [
    "垃圾广告",
    "Spam"
  ],
  "harassment": [
    "骚扰或攻击",
    "Harassment"
  ],
  "hateContent": [
    "仇恨内容",
    "Hate content"
  ],
  "sexualContent": [
    "性相关违规",
    "Sexual content"
  ],
  "violenceOrThreats": [
    "暴力或威胁",
    "Violence or threats"
  ],
  "illegalContent": [
    "违法内容",
    "Illegal content"
  ],
  "offPlatformContact": [
    "站外引流",
    "Off-platform contact"
  ],
  "misleadingInformation": [
    "虚假或误导信息",
    "Misleading information"
  ],
  "privacyExposure": [
    "隐私泄露",
    "Privacy exposure"
  ],
  "other": [
    "其他",
    "Other"
  ],
  "lowRiskActions": [
    "低风险处理",
    "Low-risk actions"
  ],
  "takeOwnershipOrCloseAReportAfterReviewingIt": [
    "用于接手工单或在确认无问题后结束举报。",
    "Take ownership or close a report after reviewing it."
  ],
  "contentActions": [
    "内容处理",
    "Content actions"
  ],
  "theseActionsChangePublicVisibilityConfirmCarefully": [
    "直接改变目标内容的公开可见性，请谨慎确认。",
    "These actions change public visibility. Confirm carefully."
  ],
  "userSafetyActions": [
    "用户安全动作",
    "User safety actions"
  ],
  "highRiskActionsThatAffectTheUserSPosting": [
    "会影响目标用户的发言或账号状态，属于高风险动作。",
    "High-risk actions that affect the user's posting access or account status."
  ],
  "markInReview": [
    "标记处理中",
    "Mark in review"
  ],
  "markTheReportInReviewAndAssignTheCurrent": [
    "把举报标记为处理中并登记当前管理员。",
    "Mark the report in review and assign the current administrator."
  ],
  "takeOwnershipOfThisReport": [
    "确认接手这条举报",
    "Take ownership of this report?"
  ],
  "theReportWillBeMarkedInReviewSoThe": [
    "该操作会把举报状态改为“处理中”，便于团队知道已经有人在跟进。",
    "The report will be marked in review so the team knows someone is handling it."
  ],
  "confirmInReview": [
    "确认标记处理中",
    "Confirm in review"
  ],
  "updatingStatus": [
    "正在更新状态...",
    "Updating status..."
  ],
  "theReportCanLaterBeDismissedOrActioned": [
    "可再改为驳回或已处理。",
    "The report can later be dismissed or actioned."
  ],
  "dismissReport": [
    "驳回举报",
    "Dismiss report"
  ],
  "dismiss": [
    "驳回",
    "Dismiss"
  ],
  "theReportWillBeDismissedAddANoteExplaining": [
    "举报会被标记为已驳回，建议补充备注说明原因。",
    "The report will be dismissed. Add a note explaining why."
  ],
  "dismissThisReport": [
    "确认驳回这条举报",
    "Dismiss this report?"
  ],
  "thisRemovesTheReportFromTheOpenQueueBut": [
    "驳回后这条举报会从待处理流程中移出，但审计事件仍会保留。",
    "This removes the report from the open queue but retains its audit history."
  ],
  "confirmDismissal": [
    "确认驳回举报",
    "Confirm dismissal"
  ],
  "dismissingReport": [
    "正在驳回举报...",
    "Dismissing report..."
  ],
  "furtherGovernanceRecordsCanAddContextButThisReport": [
    "可通过后续治理记录补充说明，但举报状态会结束。",
    "Further governance records can add context, but this report will be closed."
  ],
  "hideContent": [
    "隐藏内容",
    "Hide content"
  ],
  "hide": [
    "隐藏",
    "Hide"
  ],
  "hideTheTargetContentOrCircleFromPublicView": [
    "让目标内容或圈子从公开视图中隐藏。",
    "Hide the target content or circle from public view."
  ],
  "hideThisContent": [
    "确认隐藏目标内容",
    "Hide this content?"
  ],
  "thisChangesPublicVisibilityWhileRetainingTheRecord": [
    "该操作会影响公开可见性，适合已经确认需要下线但仍保留记录的对象。",
    "This changes public visibility while retaining the record."
  ],
  "confirmHide": [
    "确认隐藏目标",
    "Confirm hide"
  ],
  "hidingTarget": [
    "正在隐藏目标...",
    "Hiding target..."
  ],
  "aLaterAdminActionCanUsuallyRestoreTheTarget": [
    "通常可通过后续管理操作恢复，但本次举报会记为已处理。",
    "A later admin action can usually restore the target. This report will be actioned."
  ],
  "rejectTarget": [
    "拒绝目标",
    "Reject target"
  ],
  "reject": [
    "拒绝",
    "Reject"
  ],
  "rejectAPostOrCommentAsAStrongerContent": [
    "对帖子或评论执行更强的内容拒绝处理。",
    "Reject a post or comment as a stronger content action."
  ],
  "rejectThisContent": [
    "确认拒绝这条内容",
    "Reject this content?"
  ],
  "rejectionTreatsTheContentAsAViolationAddA": [
    "拒绝会将该内容视为违规处理，比普通隐藏更强，建议备注具体原因。",
    "Rejection treats the content as a violation. Add a specific reason."
  ],
  "confirmRejection": [
    "确认拒绝内容",
    "Confirm rejection"
  ],
  "rejectingContent": [
    "正在拒绝内容...",
    "Rejecting content..."
  ],
  "ordinaryUserFlowsGenerallyCannotRestoreRejectedContentProceed": [
    "通常不可由普通前台流程恢复，请谨慎操作。",
    "Ordinary user flows generally cannot restore rejected content. Proceed carefully."
  ],
  "warnUser": [
    "警告用户",
    "Warn user"
  ],
  "recordAWarningWithoutBanningTheAccount": [
    "给目标用户添加警告，不直接封禁账号。",
    "Record a warning without banning the account."
  ],
  "warnThisUser": [
    "确认警告目标用户",
    "Warn this user?"
  ],
  "theWarningWillBeRecordedInTheUserS": [
    "警告会进入用户安全记录，适合轻度但已确认的问题行为。",
    "The warning will be recorded in the user's safety history."
  ],
  "confirmWarning": [
    "确认警告用户",
    "Confirm warning"
  ],
  "warningUser": [
    "正在警告用户...",
    "Warning user..."
  ],
  "ifSupportedWarningsCanBeClearedThroughTheUser": [
    "如后台支持，可通过用户安全面板清除警告。",
    "If supported, warnings can be cleared through the user safety panel."
  ],
  "suspendUser": [
    "暂停用户",
    "Suspend user"
  ],
  "temporarilySuspendPostingAnExpiryIsRequired": [
    "临时暂停目标用户发言，需要填写暂停到期时间。",
    "Temporarily suspend posting. An expiry is required."
  ],
  "suspendThisUser": [
    "确认暂停目标用户",
    "Suspend this user?"
  ],
  "suspensionRestrictsPostingAndInteractionCheckTheExpiryAnd": [
    "暂停会直接限制发帖和互动，请确保到期时间与处理备注完整。",
    "Suspension restricts posting and interaction. Check the expiry and note."
  ],
  "confirmSuspension": [
    "确认暂停用户",
    "Confirm suspension"
  ],
  "suspendingUser": [
    "正在暂停用户...",
    "Suspending user..."
  ],
  "theSuspensionCanExpireAutomaticallyOrBeLiftedBy": [
    "到期后可自动结束，也可由管理员后续解除。",
    "The suspension can expire automatically or be lifted by an administrator."
  ],
  "banUser": [
    "封禁用户",
    "Ban user"
  ],
  "aHighRiskActionThatChangesTheUserS": [
    "高风险动作，会直接改变目标用户账号状态。",
    "A high-risk action that changes the user's account status."
  ],
  "banThisUser": [
    "确认封禁目标用户",
    "Ban this user?"
  ],
  "checkTheTargetEvidenceAndNoteCarefullyBeforeBanning": [
    "封禁是最高风险动作之一，请确认目标、证据和备注都准确无误。",
    "Check the target, evidence and note carefully before banning."
  ],
  "confirmBan": [
    "确认封禁用户",
    "Confirm ban"
  ],
  "banningUser": [
    "正在封禁用户...",
    "Banning user..."
  ],
  "onlyALaterAdministratorActionCanLiftTheBan": [
    "只能由后续管理员治理动作解除，请谨慎操作。",
    "Only a later administrator action can lift the ban. Proceed carefully."
  ],
  "unknownUser": [
    "未知用户",
    "Unknown user"
  ],
  "public": [
    "公开",
    "Public"
  ],
  "pendingReview": [
    "待审核",
    "Pending review"
  ],
  "deleted": [
    "已删除",
    "Deleted"
  ],
  "hidden": [
    "已隐藏",
    "Hidden"
  ],
  "rejected": [
    "已拒绝",
    "Rejected"
  ],
  "hiddenByAdministrator": [
    "管理员隐藏",
    "Hidden by administrator"
  ],
  "unknown": [
    "未知",
    "Unknown"
  ],
  "targetUnavailable": [
    "目标不可用",
    "Target unavailable"
  ],
  "actionFailedTryAgainLater": [
    "操作失败，请稍后再试。",
    "Action failed. Try again later."
  ],
  "theTargetContentIsUnavailableThisActionCannotContinue": [
    "目标内容已不可用，无法继续执行该操作。",
    "The target content is unavailable. This action cannot continue."
  ],
  "theAssociatedUserCannotBeIdentifiedUserSafetyActions": [
    "无法定位关联用户，暂时不能执行用户安全动作。",
    "The associated user cannot be identified. User safety actions are unavailable."
  ],
  "youCannotApplyUserSafetyActionsToYourOwn": [
    "不能对自己的账号执行用户安全动作。",
    "You cannot apply user safety actions to your own account."
  ],
  "enterAHandlingNoteBeforeSuspendingOrBanning": [
    "请先填写处理备注，再执行暂停或封禁。",
    "Enter a handling note before suspending or banning."
  ],
  "invalidSuspensionExpirySelectItAgain": [
    "暂停到期时间格式无效，请重新选择。",
    "Invalid suspension expiry. Select it again."
  ],
  "enterAnExpiryBeforeSuspendingTheUser": [
    "暂停用户前需要填写到期时间。",
    "Enter an expiry before suspending the user."
  ],
  "theSuspensionExpiryMustBeLaterThanNow": [
    "暂停到期时间必须晚于当前时间。",
    "The suspension expiry must be later than now."
  ],
  "thisUserHasAlreadyBeenBanned": [
    "该用户已经被封禁。",
    "This user has already been banned."
  ],
  "thisActionConflictsWithTheUserSCurrentSafety": [
    "当前用户状态与该动作冲突，请先查看用户安全状态。",
    "This action conflicts with the user's current safety state. Review it first."
  ],
  "circleReportsDoNotSupportRejectionUseHideTarget": [
    "圈子举报暂不支持“拒绝内容”，可改用隐藏目标。",
    "Circle reports do not support rejection. Use hide target instead."
  ],
  "userReportsDoNotSupportHidingUseAUser": [
    "用户举报不支持隐藏目标，请改用用户安全动作。",
    "User reports do not support hiding. Use a user safety action."
  ],
  "thisReportNoLongerExistsOrIsTemporarilyUnavailable": [
    "这条举报已不存在或暂时不可用。",
    "This report no longer exists or is temporarily unavailable."
  ],
  "reportCreated": [
    "举报已创建",
    "Report created"
  ],
  "notRecorded": [
    "未记录",
    "Not recorded"
  ],
  "markedInReview": [
    "标记为处理中",
    "Marked in review"
  ],
  "anAdministratorHasTakenOwnership": [
    "管理员已接手处理。",
    "An administrator has taken ownership."
  ],
  "reportDismissed": [
    "举报已驳回",
    "Report dismissed"
  ],
  "noAdditionalExplanationRecorded": [
    "未记录额外说明。",
    "No additional explanation recorded."
  ],
  "targetHidden": [
    "目标已隐藏",
    "Target hidden"
  ],
  "theTargetIsHiddenFromPublicView": [
    "目标已从公开视图中隐藏。",
    "The target is hidden from public view."
  ],
  "userWarned": [
    "已警告目标用户",
    "User warned"
  ],
  "theWarningWasRecordedInTheUserSafetySystem": [
    "用户安全系统已记录警告。",
    "The warning was recorded in the user safety system."
  ],
  "userSuspended": [
    "已暂停目标用户",
    "User suspended"
  ],
  "theUserHasBeenTemporarilySuspended": [
    "用户已被临时暂停。",
    "The user has been temporarily suspended."
  ],
  "userBanned": [
    "已封禁目标用户",
    "User banned"
  ],
  "theUserHasBeenBanned": [
    "用户已被封禁。",
    "The user has been banned."
  ],
  "targetRejected": [
    "目标已拒绝",
    "Target rejected"
  ],
  "reportActioned": [
    "举报已处理",
    "Report actioned"
  ],
  "theTargetContentWasHandledAsAViolation": [
    "目标内容已按违规处理。",
    "The target content was handled as a violation."
  ],
  "theAdministratorHasCompletedTheAction": [
    "管理员已完成处理。",
    "The administrator has completed the action."
  ],
  "noAdditionalSummary": [
    "无额外摘要。",
    "No additional summary."
  ],
  "communityUser": [
    "社区用户",
    "Community user"
  ],
  "reportMarkedInReview": [
    "举报已标记为处理中。",
    "Report marked in review."
  ],
  "reportDismissed2": [
    "举报已驳回。",
    "Report dismissed."
  ],
  "targetHiddenReportUpdated": [
    "目标已隐藏，举报已更新。",
    "Target hidden; report updated."
  ],
  "targetRejectedReportUpdated": [
    "目标已拒绝，举报已更新。",
    "Target rejected; report updated."
  ],
  "userWarningRecorded": [
    "用户警告已记录。",
    "User warning recorded."
  ],
  "userSuspended2": [
    "用户已暂停。",
    "User suspended."
  ],
  "userBanned2": [
    "用户已封禁。",
    "User banned."
  ],
  "actionUpdated": [
    "操作已更新。",
    "Action updated."
  ],
  "noSearchMatchesShortenTheQueryOrClearFilters": [
    "当前搜索没有匹配结果，请尝试缩短关键词或清空筛选。",
    "No search matches. Shorten the query or clear filters."
  ],
  "noReportsMatchTheseFilters": [
    "当前筛选条件下没有匹配的举报。",
    "No reports match these filters."
  ],
  "noReportsCurrentlyNeedHandling": [
    "当前没有可处理的举报记录。",
    "No reports currently need handling."
  ],
  "yourSessionExpiredSignInAgain": [
    "登录状态已失效，请重新登录",
    "Your session expired. Sign in again."
  ],
  "thisAccountDoesNotHaveAdministratorAccess": [
    "当前账号没有管理员权限",
    "This account does not have administrator access."
  ],
  "failedToLoadReports": [
    "加载举报列表失败",
    "Failed to load reports"
  ],
  "failedToLoadReportDetails": [
    "加载举报详情失败",
    "Failed to load report details"
  ],
  "reportQueue": [
    "举报队列",
    "Report queue"
  ],
  "reviewReportStatusTargetsAndHistoryWhilePreservingReporter": [
    "更快扫描举报状态、目标对象和处理历史，同时继续保护 reporter 隐私与后台安全边界。",
    "Review report status, targets and history while preserving reporter privacy."
  ],
  "currentAdministrator": [
    "当前管理员：",
    "Current administrator: "
  ],
  "currentResults": [
    "当前结果",
    "Current results"
  ],
  "reportsAfterFilteringAndSearch": [
    "筛选和搜索后的举报数量",
    "Reports after filtering and search"
  ],
  "awaitingAnAdministrator": [
    "仍需人工开始处理",
    "Awaiting an administrator"
  ],
  "assignedToAnAdministrator": [
    "已经有管理员接手",
    "Assigned to an administrator"
  ],
  "highPriority": [
    "高优先级",
    "High priority"
  ],
  "reportsToReviewFirst": [
    "建议优先查看的工单",
    "Reports to review first"
  ],
  "localSearch": [
    "本地搜索",
    "Local search"
  ],
  "searchReportTitlesExcerptsReasonsOrTargetIDs": [
    "搜索举报标题、摘要、原因、对象 ID",
    "Search report titles, excerpts, reasons or target IDs"
  ],
  "reportFilters": [
    "举报筛选",
    "Report filters"
  ],
  "clearFilters": [
    "清空筛选",
    "Clear filters"
  ],
  "currentFilters": [
    "当前筛选条件",
    "Current filters"
  ],
  "clear": [
    "· 清除",
    " · Clear"
  ],
  "refreshingQueue": [
    "正在刷新当前队列...",
    "Refreshing queue..."
  ],
  "loadingReports": [
    "正在加载举报队列...",
    "Loading reports..."
  ],
  "noReports": [
    "暂无举报",
    "No reports"
  ],
  "noMatchingResults": [
    "没有匹配结果",
    "No matching results"
  ],
  "reports": [
    "举报列表",
    "Reports"
  ],
  "reporter": [
    "举报人：",
    "Reporter: "
  ],
  "anonymousReporter": [
    "匿名举报者",
    "Anonymous reporter"
  ],
  "created": [
    "· 创建于",
    " · Created "
  ],
  "targetAuthor": [
    "目标作者：",
    "Target author: "
  ],
  "lastActivity": [
    "最后活动：",
    "Last activity: "
  ],
  "theOnlyOpenReportForThisTarget": [
    "当前为该目标唯一待处理举报",
    "The only open report for this target"
  ],
  "loadingReportDetails": [
    "正在加载举报详情...",
    "Loading report details..."
  ],
  "reportUnavailable": [
    "举报已不可用",
    "Report unavailable"
  ],
  "thisReportMayBeDeletedOrTemporarilyUnavailableSelect": [
    "这条举报可能已被删除或暂时无法读取，请返回列表选择其他记录。",
    "This report may be deleted or temporarily unavailable. Select another record."
  ],
  "selectAReportToViewDetails": [
    "选择一条举报查看详情。",
    "Select a report to view details."
  ],
  "reportStatus": [
    "· 举报状态",
    " · Report status "
  ],
  "openReportsForThisTarget": [
    "· 待处理同目标举报",
    " · Open reports for this target "
  ],
  "viewTarget": [
    "查看目标",
    "View target"
  ],
  "targetInaccessible": [
    "目标不可访问",
    "Target inaccessible"
  ],
  "reportInformation": [
    "举报信息",
    "Report information"
  ],
  "reportID": [
    "举报编号：",
    "Report ID: "
  ],
  "reasonCategory": [
    "原因分类：",
    "Reason category: "
  ],
  "priority": [
    "优先级：",
    "Priority: "
  ],
  "created2": [
    "创建时间：",
    "Created: "
  ],
  "targetOverview": [
    "目标概览",
    "Target overview"
  ],
  "targetType": [
    "对象类型：",
    "Target type: "
  ],
  "targetID": [
    "目标 ID：",
    "Target ID: "
  ],
  "contentAuthor": [
    "内容作者：",
    "Content author: "
  ],
  "currentVisibility": [
    "当前可见状态：",
    "Current visibility: "
  ],
  "assignedAdministrator": [
    "指派管理员：",
    "Assigned administrator: "
  ],
  "resolvedBy": [
    "解决人：",
    "Resolved by: "
  ],
  "targetExcerpt": [
    "目标摘要",
    "Target excerpt"
  ],
  "noTargetExcerptAvailable": [
    "没有可显示的目标摘要。",
    "No target excerpt available."
  ],
  "reportDescription": [
    "举报说明",
    "Report description"
  ],
  "reportReason": [
    "举报理由",
    "Report reason"
  ],
  "handlingNote": [
    "处理备注",
    "Handling note"
  ],
  "noHandlingNoteRecorded": [
    "暂未记录处理备注。",
    "No handling note recorded."
  ],
  "completedAt": [
    "处理完成时间",
    "Completed at"
  ],
  "notResolved": [
    "尚未结案",
    "Not resolved"
  ],
  "actionInput": [
    "处理输入",
    "Action input"
  ],
  "addANoteForHighRiskActionsSuspendingA": [
    "高风险动作建议填写处理备注。暂停用户时必须提供到期时间。",
    "Add a note for high-risk actions. Suspending a user requires an expiry."
  ],
  "recordTheReasonEvidenceSummaryOrUserSafetyContext": [
    "记录处理原因、证据摘要或用户安全说明",
    "Record the reason, evidence summary or user safety context"
  ],
  "suspensionExpiry": [
    "暂停到期时间（仅 suspend）",
    "Suspension expiry"
  ],
  "actions": [
    "处理动作",
    "Actions"
  ],
  "actionTimeline": [
    "处理时间线",
    "Action timeline"
  ],
  "actor": [
    "操作人：",
    "Actor: "
  ],
  "noActionHistory": [
    "暂无处理记录。",
    "No action history."
  ],
  "confirmAction": [
    "确认操作",
    "Confirm action"
  ],
  "confirmBeforeContinuing": [
    "请确认后继续。",
    "Confirm before continuing."
  ],
  "featuredIndustry": [
    "推荐 / 行业",
    "Featured / Industry"
  ],
  "devices": [
    "设备",
    "Devices"
  ],
  "aIGlasses": [
    "AI 眼镜",
    "AI glasses"
  ],
  "aRGlasses": [
    "AR 眼镜",
    "AR glasses"
  ],
  "developers": [
    "开发者",
    "Developers"
  ],
  "community": [
    "社区",
    "Community"
  ],
  "all": [
    "全部",
    "All"
  ],
  "draft": [
    "草稿",
    "Draft"
  ],
  "published": [
    "已发布",
    "Published"
  ],
  "archived": [
    "已归档",
    "Archived"
  ],
  "allCategories": [
    "全部分类",
    "All categories"
  ],
  "draftSaved": [
    "已保存草稿",
    "Draft saved"
  ],
  "saved": [
    "已保存",
    "Saved"
  ],
  "saving": [
    "正在保存...",
    "Saving..."
  ],
  "publishing": [
    "正在发布...",
    "Publishing..."
  ],
  "archiving": [
    "正在归档...",
    "Archiving..."
  ],
  "yourSessionHasExpiredSignInAgain": [
    "登录状态已失效，请重新登录。",
    "Your session has expired. Sign in again."
  ],
  "thisAccountHasNoAdministratorAccess": [
    "当前账号没有管理员权限。",
    "This account has no administrator access."
  ],
  "actionFailedPleaseTryAgainLater": [
    "操作失败，请稍后重试。",
    "Action failed. Please try again later."
  ],
  "image": [
    "图片",
    "Image"
  ],
  "failedToLoadNews": [
    "加载资讯列表失败",
    "Failed to load news"
  ],
  "coverUploaded": [
    "封面图已上传",
    "Cover uploaded"
  ],
  "coverUploadFailedTryAgainLater": [
    "封面图上传失败，请稍后重试",
    "Cover upload failed. Try again later."
  ],
  "bodyImageInserted": [
    "正文图片已插入",
    "Body image inserted"
  ],
  "bodyImageUploadFailedTryAgainLater": [
    "正文图片上传失败，请稍后重试",
    "Body image upload failed. Try again later."
  ],
  "enterAValidImageURL": [
    "请输入有效的图片链接",
    "Enter a valid image URL"
  ],
  "noNewsArticleSelectedForDeletion": [
    "当前没有可删除的资讯。",
    "No news article selected for deletion."
  ],
  "newsPublishing": [
    "资讯发布台",
    "News publishing"
  ],
  "createIllustratePublishAndArchiveNewsArticles": [
    "让管理员可以直接创建、插图、发布和归档资讯，不需要理解技术字段。",
    "Create, illustrate, publish and archive news articles."
  ],
  "newArticle": [
    "新建资讯",
    "New article"
  ],
  "status": [
    "状态",
    "Status"
  ],
  "category": [
    "分类",
    "Category"
  ],
  "titleOrSlug": [
    "标题或 slug",
    "Title or slug"
  ],
  "filter": [
    "筛选",
    "Filter"
  ],
  "clear2": [
    "清空",
    "Clear"
  ],
  "articles": [
    "文章列表",
    "Articles"
  ],
  "newestUpdatesFirstFilterByStatusCategoryTitleOr": [
    "按最近更新时间排序，可按状态、分类、标题或 slug 筛选。",
    "Newest updates first. Filter by status, category, title or slug."
  ],
  "articles2": [
    "篇",
    " articles"
  ],
  "loadingArticles": [
    "正在加载资讯列表...",
    "Loading articles..."
  ],
  "noArticles": [
    "暂无资讯",
    "No articles"
  ],
  "createTheFirstArticle": [
    "先创建第一篇内容。",
    "Create the first article."
  ],
  "unpublished": [
    "未发布",
    "Unpublished"
  ],
  "updated": [
    "更新于",
    "Updated "
  ],
  "views": [
    "阅读",
    "Views"
  ],
  "featured": [
    "精选",
    "Featured"
  ],
  "pinned": [
    "置顶",
    "Pinned"
  ],
  "editArticle": [
    "编辑资讯",
    "Edit article"
  ],
  "editTheTitleCoverBodyAndPublicationSettingsPublishing": [
    "标题、封面、正文、发布设置都集中在右侧，发布后会立即进入公开资讯流。",
    "Edit the title, cover, body and publication settings. Publishing adds the article to the public feed."
  ],
  "published2": [
    "发布于",
    "Published "
  ],
  "basicInformation": [
    "基础信息",
    "Basic information"
  ],
  "theTitleGeneratesAnArticleURLPreviewAutomatically": [
    "标题会自动生成文章链接预览，管理员不需要手动理解 slug。",
    "The title generates an article URL preview automatically."
  ],
  "generatedFromTitle": [
    "根据标题生成",
    "Generated from title"
  ],
  "title": [
    "标题",
    "Title"
  ],
  "enterAnArticleTitle": [
    "输入资讯标题",
    "Enter an article title"
  ],
  "articleURLPreview": [
    "文章链接预览",
    "Article URL preview"
  ],
  "usedInTheArticleURLCanBeGeneratedAutomatically": [
    "用于文章链接，可自动生成。",
    "Used in the article URL; can be generated automatically."
  ],
  "summary": [
    "摘要",
    "Summary"
  ],
  "summaryForNewsCardsAndTheArticlePage": [
    "用于资讯卡片和详情页摘要",
    "Summary for news cards and the article page"
  ],
  "coverImage": [
    "封面图",
    "Cover image"
  ],
  "pasteAnImageURLOrUploadAnImage": [
    "支持直接粘贴图片链接，也支持上传到站内存储。",
    "Paste an image URL or upload an image."
  ],
  "uploading": [
    "上传中...",
    "Uploading..."
  ],
  "uploadCover": [
    "上传封面图",
    "Upload cover"
  ],
  "coverURL": [
    "封面图链接",
    "Cover URL"
  ],
  "httpsOrAnUploadedCoverPath": [
    "https://... 或已上传的封面路径",
    "https://... or an uploaded cover path"
  ],
  "coverPreview": [
    "封面预览",
    "Cover preview"
  ],
  "coverPreviewAppearsHere": [
    "封面预览会显示在这里",
    "Cover preview appears here"
  ],
  "coverPreviewUnavailableCheckTheURLOrUploadAgain": [
    "封面图暂时无法预览，请检查链接或重新上传。",
    "Cover preview unavailable. Check the URL or upload again."
  ],
  "articleContent": [
    "正文内容",
    "Article content"
  ],
  "markdownSupportsParagraphsHeadingsLinksAndImages": [
    "正文按 Markdown 轻量渲染，支持段落、标题、链接和图片。",
    "Markdown supports paragraphs, headings, links and images."
  ],
  "insertImageURL": [
    "插入图片链接",
    "Insert image URL"
  ],
  "uploadImage": [
    "上传图片",
    "Upload image"
  ],
  "imageURL": [
    "图片链接",
    "Image URL"
  ],
  "imageDescription": [
    "图片说明",
    "Image description"
  ],
  "insertIntoBody": [
    "插入到正文",
    "Insert into body"
  ],
  "body": [
    "正文",
    "Body"
  ],
  "heading1010BodyParagraph1010ImageHttps": [
    "# 标题&#10;&#10;正文段落...&#10;&#10;![图片](https://...)",
    "# Heading&#10;&#10;Body paragraph...&#10;&#10;![Image](https://...)"
  ],
  "publicationSettings": [
    "发布设置",
    "Publication settings"
  ],
  "leaveThePublicationTimeBlankToUseTheCurrent": [
    "留空发布时间时，点击发布会自动使用当前时间。",
    "Leave the publication time blank to use the current time when publishing."
  ],
  "hideAdvancedSettings": [
    "收起高级设置",
    "Hide advanced settings"
  ],
  "advancedSettings": [
    "高级设置",
    "Advanced settings"
  ],
  "pinToTheTopOfTheNewsList": [
    "置顶到资讯列表前面",
    "Pin to the top of the news list"
  ],
  "publishedPinnedArticlesAppearFirst": [
    "已发布后会优先出现在资讯列表前部。",
    "Published pinned articles appear first."
  ],
  "featureAsTheTopHeadline": [
    "设为顶部精选头条",
    "Feature as the top headline"
  ],
  "theLatestFeaturedArticleAppearsAtTheTopOf": [
    "最新的精选文章会显示在 `/news/` 顶部大卡位。",
    "The latest featured article appears at the top of /news/."
  ],
  "articleSlug": [
    "文章链接 slug",
    "Article slug"
  ],
  "leaveBlankToGenerateFromTheTitle": [
    "留空则按标题自动生成",
    "Leave blank to generate from the title"
  ],
  "useLowercaseLettersNumbersAndHyphensOnly": [
    "只允许小写字母、数字和连字符。",
    "Use lowercase letters, numbers and hyphens only."
  ],
  "customPublicationTime": [
    "自定义发布时间",
    "Custom publication time"
  ],
  "leaveBlankToPublishNow": [
    "留空则发布时间为现在。",
    "Leave blank to publish now."
  ],
  "clearTime": [
    "清空时间",
    "Clear time"
  ],
  "regenerateURL": [
    "重新生成链接",
    "Regenerate URL"
  ],
  "sourceInformation": [
    "来源信息",
    "Source information"
  ],
  "sourceNameAndURLAreOptionalKeepTheDefault": [
    "来源名称和来源链接都可选；Lensden 原创内容可直接保留默认来源名。",
    "Source name and URL are optional. Keep the default name for original Lensden content."
  ],
  "sourceName": [
    "来源名称",
    "Source name"
  ],
  "sourceURL": [
    "来源链接",
    "Source URL"
  ],
  "savingChanges": [
    "保存中...",
    "Saving changes..."
  ],
  "saveChanges": [
    "保存修改",
    "Save changes"
  ],
  "saveDraft": [
    "保存草稿",
    "Save draft"
  ],
  "publishingArticle": [
    "发布中...",
    "Publishing article..."
  ],
  "publish": [
    "发布",
    "Publish"
  ],
  "archivingArticle": [
    "归档中...",
    "Archiving article..."
  ],
  "archive": [
    "归档",
    "Archive"
  ],
  "deleting": [
    "删除中...",
    "Deleting..."
  ],
  "delete": [
    "删除",
    "Delete"
  ],
  "preview": [
    "预览",
    "Preview"
  ],
  "deleteArticle": [
    "删除资讯",
    "Delete article"
  ],
  "thisRemovesTheArticleFromTheAdminListAnd": [
    "删除后这篇资讯会从后台列表和公开页移除。",
    "This removes the article from the admin list and public pages."
  ],
  "confirmDeletionOfThisArticle": [
    "请确认是否删除当前资讯。",
    "Confirm deletion of this article."
  ],
  "confirmDelete": [
    "确认删除",
    "Confirm delete"
  ],
  "failedToLoadModerationQueue": [
    "加载审核队列失败",
    "Failed to load moderation queue"
  ],
  "approved": [
    "已通过",
    "Approved"
  ],
  "moderationQueue": [
    "审核队列",
    "Moderation queue"
  ],
  "reviewPendingPostsAndCommentsAndRecentlyRejectedOr": [
    "处理待审核帖子与评论，并查看最近被拒绝或隐藏的内容。",
    "Review pending posts and comments, and recently rejected or hidden content."
  ],
  "loadingModerationQueue": [
    "正在加载审核队列...",
    "Loading moderation queue..."
  ],
  "noContentPending": [
    "当前没有待处理内容",
    "No content pending"
  ],
  "theModerationQueueIsEmpty": [
    "审核队列为空。",
    "The moderation queue is empty."
  ],
  "author": [
    "· 作者",
    " · Author "
  ],
  "score": [
    "· 评分",
    " · Score "
  ],
  "circle2": [
    "圈子：",
    "Circle: "
  ],
  "parentPost": [
    "所属帖子：",
    "Parent post: "
  ],
  "noExcerpt": [
    "无摘要",
    "No excerpt"
  ],
  "approve": [
    "通过",
    "Approve"
  ],
  "failedToLoadMedia": [
    "加载媒体列表失败",
    "Failed to load media"
  ],
  "mediaDeletedAndStorageCleaned": [
    "媒体已删除并完成存储清理",
    "Media deleted and storage cleaned"
  ],
  "failedToDeleteMedia": [
    "删除媒体失败",
    "Failed to delete media"
  ],
  "mediaAudit": [
    "媒体审计",
    "Media audit"
  ],
  "reviewRecentMediaLinkedPostsUploadersAndCleanupStatus": [
    "查看最近媒体、绑定帖子、上传者和清理状态。",
    "Review recent media, linked posts, uploaders and cleanup status."
  ],
  "video": [
    "视频",
    "Video"
  ],
  "largeFiles": [
    "大文件",
    "Large files"
  ],
  "unbound": [
    "未绑定",
    "Unbound"
  ],
  "last24Hours": [
    "最近 24h",
    "Last 24 hours"
  ],
  "loadingMedia": [
    "正在加载媒体列表...",
    "Loading media..."
  ],
  "noMedia": [
    "暂无媒体",
    "No media"
  ],
  "noMediaMatchesTheseFilters": [
    "当前筛选条件下没有媒体记录。",
    "No media matches these filters."
  ],
  "post2": [
    "帖子：",
    "Post: "
  ],
  "unbound2": [
    "(未绑定)",
    "(unbound)"
  ],
  "uploader": [
    "上传者：",
    "Uploader: "
  ],
  "openMedia": [
    "打开媒体",
    "Open media"
  ],
  "deleteMedia": [
    "删除媒体",
    "Delete media"
  ],
  "deletedSomeMediaCleanupNeedsALaterRetry": [
    "已删除，部分媒体清理需要后续重试",
    "Deleted; some media cleanup needs a later retry"
  ],
  "deletedAndMediaCleaned": [
    "已删除并清理媒体",
    "Deleted and media cleaned"
  ],
  "postDeleted": [
    "帖子已删除",
    "Post deleted"
  ],
  "openManagement": [
    "去管理页",
    "Open management"
  ],
  "viewPost": [
    "查看帖子",
    "View post"
  ],
  "failedToLoadPosts": [
    "加载帖子列表失败",
    "Failed to load posts"
  ],
  "restoredToPublic": [
    "已恢复为公开",
    "Restored to public"
  ],
  "forumGovernance": [
    "管理员帖子治理",
    "Forum governance"
  ],
  "reviewPostsAuthorsMediaSizeAndReportCountsHide": [
    "查看帖子内容、作者资料、媒体体积和举报数量，并执行隐藏、恢复、删除。",
    "Review posts, authors, media size and report counts. Hide, restore or delete content."
  ],
  "role2": [
    "·\r\n        角色",
    " · Role "
  ],
  "showingOnlyPost": [
    "当前仅显示帖子",
    "Showing only post "
  ],
  "backToAllPosts": [
    "返回全部帖子",
    "Back to all posts"
  ],
  "loadingPosts": [
    "正在加载帖子列表...",
    "Loading posts..."
  ],
  "noPosts": [
    "暂无帖子",
    "No posts"
  ],
  "postNotFound": [
    "未找到对应帖子。",
    "Post not found."
  ],
  "noPostsMatchTheseFilters": [
    "当前筛选条件下没有可治理的帖子。",
    "No posts match these filters."
  ],
  "author2": [
    "作者：",
    "Author: "
  ],
  "media": [
    "媒体：",
    "Media: "
  ],
  "videos": [
    "视频：",
    "Videos: "
  ],
  "totalMediaSize": [
    "媒体总大小：",
    "Total media size: "
  ],
  "reports2": [
    "举报：",
    "Reports: "
  ],
  "hidePost": [
    "隐藏帖子",
    "Hide post"
  ],
  "restorePublicVisibility": [
    "恢复公开",
    "Restore public visibility"
  ],
  "deletePost": [
    "删除帖子",
    "Delete post"
  ],
  "invalidForm": [
    "表单无效。",
    "Invalid form."
  ],
  "deviceManagement": [
    "设备管理",
    "Device management"
  ],
  "deviceCatalogManagement": [
    "设备库管理",
    "Device catalog management"
  ],
  "deviceOperationsUseTheProtectedAdminAPINewDevices": [
    "所有操作通过受保护的设备管理 API 完成。新设备始终先保存为草稿。",
    "Device operations use the protected admin API. New devices start as drafts."
  ],
  "createDevice": [
    "创建设备",
    "Create device"
  ],
  "publicationStatusFilters": [
    "发布状态筛选",
    "Publication status filters"
  ],
  "retry": [
    "重试",
    "Retry"
  ],
  "deviceList": [
    "设备列表",
    "Device list"
  ],
  "manageDraftPublishedHiddenAndArchivedRecords": [
    "草稿、已发布、隐藏和归档记录均可管理。",
    "Manage draft, published, hidden and archived records."
  ],
  "loadingDevices": [
    "正在加载设备...",
    "Loading devices..."
  ],
  "noDevices": [
    "暂无设备",
    "No devices"
  ],
  "changeFiltersOrCreateTheFirstDraft": [
    "调整筛选条件或创建第一个草稿。",
    "Change filters or create the first draft."
  ],
  "editDevice": [
    "编辑设备",
    "Edit device"
  ],
  "newDevice": [
    "新建设备",
    "New device"
  ],
  "changesTakeEffectAfterSaving": [
    "内容更改保存后才会成为当前记录。",
    "Changes take effect after saving."
  ],
  "newDevicesRemainDraftsPublishingRequiresASeparateConfirmation": [
    "创建后保持草稿，发布由独立操作确认。",
    "New devices remain drafts. Publishing requires a separate confirmation."
  ],
  "brandKey": [
    "品牌代码",
    "Brand key"
  ],
  "brandName": [
    "品牌名称",
    "Brand name"
  ],
  "deviceName": [
    "设备名称",
    "Device name"
  ],
  "uRLSlug": [
    "链接 slug",
    "URL slug"
  ],
  "releaseYear": [
    "发布年份",
    "Release year"
  ],
  "typeLabel": [
    "类型标签",
    "Type label"
  ],
  "statusLabel": [
    "状态标签",
    "Status label"
  ],
  "availability": [
    "可用性",
    "Availability"
  ],
  "imageAltText": [
    "图片替代文字",
    "Image alt text"
  ],
  "productImageURL": [
    "产品图片 URL",
    "Product image URL"
  ],
  "officialImageURL": [
    "官网图片 URL",
    "Official image URL"
  ],
  "productURL": [
    "产品链接",
    "Product URL"
  ],
  "officialURL": [
    "官网链接",
    "Official URL"
  ],
  "buyURL": [
    "购买链接",
    "Buy URL"
  ],
  "theURLIsPermanentlyLockedAfterTheFirstPublication": [
    "首次发布后链接已永久锁定。",
    "The URL is permanently locked after the first publication."
  ],
  "shortDescription": [
    "简短描述",
    "Short description"
  ],
  "longDescription": [
    "详细描述",
    "Long description"
  ],
  "positioning": [
    "定位",
    "Positioning"
  ],
  "routeLabel": [
    "路由标签",
    "Route label"
  ],
  "routeDescription": [
    "路由说明",
    "Route description"
  ],
  "bestForOneItemPerLine": [
    "适合对象，每行一项",
    "Best for, one item per line"
  ],
  "notIdealForOneItemPerLine": [
    "不适合对象，每行一项",
    "Not ideal for, one item per line"
  ],
  "limitationsOneItemPerLine": [
    "限制，每行一项",
    "Limitations, one item per line"
  ],
  "mediaJSON": [
    "媒体 JSON",
    "Media JSON"
  ],
  "keySpecsJSON": [
    "关键规格 JSON",
    "Key specs JSON"
  ],
  "fullSpecsJSON": [
    "完整规格 JSON",
    "Full specs JSON"
  ],
  "createDraft": [
    "创建草稿",
    "Create draft"
  ],
  "restoreAs": [
    "恢复为",
    "Restore as"
  ],
  "restore": [
    "恢复",
    "Restore"
  ],
  "permanentlyDelete": [
    "永久删除",
    "Permanently delete"
  ],
  "publishDevice": [
    "发布设备",
    "Publish device"
  ],
  "publishingPermanentlyLocksTheSlugContinue": [
    "发布后 slug 将永久锁定。继续吗？",
    "Publishing permanently locks the slug. Continue?"
  ],
  "confirmPublish": [
    "确认发布",
    "Confirm publish"
  ],
  "permanentlyDeleteDevice": [
    "永久删除设备",
    "Permanently delete device"
  ],
  "thisPermanentlyDeletesTheDeviceRecordAndCannotBe": [
    "这会永久删除设备记录，且无法撤销。",
    "This permanently deletes the device record and cannot be undone."
  ],
  "confirmPermanentDeletion": [
    "确认永久删除",
    "Confirm permanent deletion"
  ],
  "generalTopic": [
    "通用话题",
    "General topic"
  ],
  "deviceCircle": [
    "设备圈子",
    "Device circle"
  ],
  "projectCircle": [
    "项目圈子",
    "Project circle"
  ],
  "aCircleWithThisNameAlreadyExists": [
    "圈子名称已存在。",
    "A circle with this name already exists."
  ],
  "circleCoverUploadFailed": [
    "圈子封面上传失败。",
    "Circle cover upload failed."
  ],
  "circleURLGenerationFailedTryADifferentName": [
    "圈子链接生成失败，请换一个名称后重试。",
    "Circle URL generation failed. Try a different name."
  ],
  "theCircleStatusMigrationIsNotInstalled": [
    "数据库还没有完成圈子状态 migration，请先执行最新 SQL。",
    "The circle status migration is not installed."
  ],
  "noOwner": [
    "无 owner",
    "No owner"
  ],
  "activeCircle": [
    "正常使用",
    "Active circle"
  ],
  "onlyDeletedCirclesCanBePermanentlyDeleted": [
    "只有已删除的圈子可以永久删除。",
    "Only deleted circles can be permanently deleted."
  ],
  "thisCircleStillHasPostsAndCannotBePermanently": [
    "该圈子仍有帖子，不能永久删除。",
    "This circle still has posts and cannot be permanently deleted."
  ],
  "thisCircleStillHasReportsAndCannotBePermanently": [
    "该圈子仍有关联举报记录，不能永久删除。",
    "This circle still has reports and cannot be permanently deleted."
  ],
  "theCircleDoesNotExistOrWasDeleted": [
    "圈子不存在或已被删除。",
    "The circle does not exist or was deleted."
  ],
  "permanentDeletionIsUnavailableInThisState": [
    "当前状态不允许永久删除。",
    "Permanent deletion is unavailable in this state."
  ],
  "failedToLoadCircles": [
    "加载圈子失败",
    "Failed to load circles"
  ],
  "circleCreated": [
    "圈子已创建。",
    "Circle created."
  ],
  "failedToCreateCircle": [
    "创建圈子失败",
    "Failed to create circle"
  ],
  "circleUpdated": [
    "圈子已更新。",
    "Circle updated."
  ],
  "failedToUpdateCircle": [
    "更新圈子失败",
    "Failed to update circle"
  ],
  "circleCoverUpdated": [
    "圈子封面已更新。",
    "Circle cover updated."
  ],
  "circleCoverCleared": [
    "圈子封面已清除。",
    "Circle cover cleared."
  ],
  "failedToUpdateCover": [
    "更新封面失败",
    "Failed to update cover"
  ],
  "circleDeleted": [
    "圈子已删除。",
    "Circle deleted."
  ],
  "circleHidden": [
    "圈子已隐藏。",
    "Circle hidden."
  ],
  "circleVisibilityRestored": [
    "圈子已恢复显示。",
    "Circle visibility restored."
  ],
  "failedToUpdateCircleStatus": [
    "更新圈子状态失败",
    "Failed to update circle status"
  ],
  "failedToLoadPermanentDeletionChecks": [
    "无法读取永久删除预检",
    "Failed to load permanent deletion checks"
  ],
  "circlePermanentlyDeleted": [
    "圈子已永久删除。",
    "Circle permanently deleted."
  ],
  "permanentDeletionFailed": [
    "永久删除失败",
    "Permanent deletion failed"
  ],
  "circleManagement": [
    "管理员圈子管理",
    "Circle management"
  ],
  "reviewOwnersPostAndCommentCountsAndMaintainCircle": [
    "查看 owner、帖子/评论数量，并维护圈子信息与封面。",
    "Review owners, post and comment counts, and maintain circle details and covers."
  ],
  "circleStatusFilters": [
    "圈子状态筛选",
    "Circle status filters"
  ],
  "createCircle": [
    "创建圈子",
    "Create circle"
  ],
  "circleName": [
    "圈子名称",
    "Circle name"
  ],
  "circleType": [
    "圈子类型",
    "Circle type"
  ],
  "coverImageFile": [
    "封面图片",
    "Cover image file"
  ],
  "circleDescription": [
    "圈子说明",
    "Circle description"
  ],
  "creating": [
    "创建中...",
    "Creating..."
  ],
  "cover": [
    "封面：",
    "Cover: "
  ],
  "set": [
    "已设置",
    "Set"
  ],
  "notSet": [
    "未设置",
    "Not set"
  ],
  "comments": [
    "评论：",
    "Comments: "
  ],
  "updateCover": [
    "更新封面",
    "Update cover"
  ],
  "clearCover": [
    "清除封面",
    "Clear cover"
  ],
  "restoreVisibility": [
    "恢复显示",
    "Restore visibility"
  ],
  "restoreCircle": [
    "恢复圈子",
    "Restore circle"
  ],
  "managePostsAndComments": [
    "管理帖子和评论",
    "Manage posts and comments"
  ],
  "publicPageHidden": [
    "公开页已隐藏",
    "Public page hidden"
  ],
  "viewPublicPage": [
    "查看公开页",
    "View public page"
  ],
  "confirmCircleDeletion": [
    "确认删除圈子",
    "Confirm circle deletion"
  ],
  "thisCannotBeUndoneContinueOnlyWhenTheCircle": [
    "此操作无法恢复。只有不存在帖子和圈子举报记录时才能继续。",
    "This cannot be undone. Continue only when the circle has no posts or circle reports."
  ],
  "deletionHidesTheCircleFromPublicListsItsDetail": [
    "删除后圈子会从公开列表、圈子详情和发帖选择器中隐藏，但数据库记录仍会保留。",
    "Deletion hides the circle from public lists, its detail page and the posting selector, while retaining the database record."
  ],
  "yes": [
    "有",
    "Yes"
  ],
  "no": [
    "无",
    "No"
  ],
  "checkingSignInStatus": [
    "正在确认登录状态...",
    "Checking sign-in status..."
  ],
  "supabaseBrowserClientUnavailable": [
    "Supabase 浏览器客户端不可用",
    "Supabase browser client unavailable"
  ],
  "sessionCheckTimedOutRefreshOrSignInAgain": [
    "登录状态确认超时，请刷新页面或重新登录",
    "Session check timed out. Refresh or sign in again."
  ],
  "failedToReadSignInStatus": [
    "登录状态读取失败",
    "Failed to read sign-in status"
  ],
  "signInFirst": [
    "请先登录",
    "Sign in first"
  ],
  "administratorAccessConfirmed": [
    "管理员权限已确认",
    "Administrator access confirmed"
  ],
  "failedToConfirmAdministratorAccess": [
    "管理员权限确认失败",
    "Failed to confirm administrator access"
  ],
  "failedToConfirmSignInStatus": [
    "登录状态确认失败",
    "Failed to confirm sign-in status"
  ]
} as const;

function copies(locale: ResolvedLocale) {
  return Object.fromEntries(Object.entries(copyPairs).map(([key, pair]) => [key, pair[locale === "zh-CN" ? 0 : 1]])) as { readonly [K in keyof typeof copyPairs]: string };
}

function messages(locale: ResolvedLocale) {
  const copy = copies(locale);
  const pages = locale === "zh-CN" ? {"users":{"title":"管理员用户安全","description":"Lensden 管理员用户安全与封禁控制台。","lead":"查看用户安全状态、执行 warning / suspend / ban / unban，并检查安全事件历史。"},"reports":{"title":"管理员举报列表","description":"Lensden 管理员举报队列。","lead":"查看 post / comment / circle / user 举报，并联动内容治理与用户安全动作。"},"news":{"title":"管理员热点发布","description":"Lensden 管理员热点发布页。","lead":"管理热点文章、草稿、发布状态和公开信息流布局。"},"moderation":{"title":"管理员审核队列","description":"Lensden 管理员社区审核队列。","lead":"处理待审核帖子与评论，并查看最近被拒绝或隐藏的内容。"},"media":{"title":"管理员媒体审计","description":"Lensden 管理员媒体审计页。","lead":"筛选视频、大文件、未绑定媒体，并执行单条媒体删除。"},"forum":{"title":"管理员论坛治理","description":"Lensden 管理员论坛治理页。","lead":"最近帖子、状态、媒体体积、举报量，以及隐藏/恢复/删除操作。"},"devices":{"title":"管理员设备库","description":"Lensden 管理员设备库。","lead":"管理设备草稿、发布状态、规格与归档记录。"},"circles":{"title":"管理员圈子管理","description":"Lensden 管理员圈子管理","lead":"创建和编辑圈子，查看 owner，并进入圈子的帖子 / 评论管理视图。"}} : {"users":{"title":"Admin user safety","description":"Lensden admin user safety and restriction console.","lead":"Review user safety, manage warnings, suspensions and bans, and inspect event history."},"reports":{"title":"Admin reports","description":"Lensden admin report queue.","lead":"Review reports about posts, comments, circles and users, and apply content or user safety actions."},"news":{"title":"Admin news publishing","description":"Lensden admin news publishing.","lead":"Manage news articles, drafts, publication status and the public feed."},"moderation":{"title":"Admin moderation queue","description":"Lensden admin community moderation queue.","lead":"Review pending posts and comments, and recently rejected or hidden content."},"media":{"title":"Admin media audit","description":"Lensden admin media audit.","lead":"Filter videos, large files and unbound media, and delete individual records."},"forum":{"title":"Admin forum governance","description":"Lensden admin forum governance.","lead":"Review recent posts, status, media size and report counts; hide, restore or delete posts."},"devices":{"title":"Admin device catalog","description":"Lensden admin device catalog.","lead":"Manage device drafts, publication status, specifications and archived records."},"circles":{"title":"Admin circle management","description":"Lensden admin circle management.","lead":"Create and edit circles, review owners, and manage their posts and comments."}};
  return { copy, pages, reports: {
    filters: { status: { all: copy.allStatuses }, target: { all: copy.allTargets } },
    actions: { dismiss: { label: copy.dismissReport }, hide_target: { label: copy.hideContent }, ban_user: { label: copy.banUser } },
  } };
}

export const adminMessages = { "zh-CN": messages("zh-CN"), en: messages("en") } as const;

const sessionCopyKeys = {
  "登录状态已失效，请重新登录": "yourSessionExpiredSignInAgain",
  "当前账号没有管理员权限": "thisAccountDoesNotHaveAdministratorAccess",
  "正在确认登录状态...": "checkingSignInStatus",
  "Supabase 浏览器客户端不可用": "supabaseBrowserClientUnavailable",
  "登录状态确认超时，请刷新页面或重新登录": "sessionCheckTimedOutRefreshOrSignInAgain",
  "登录状态读取失败": "failedToReadSignInStatus",
  "请先登录": "signInFirst",
  "管理员权限已确认": "administratorAccessConfirmed",
  "管理员权限确认失败": "failedToConfirmAdministratorAccess",
  "登录状态确认失败": "failedToConfirmSignInStatus"
} as const;

export function localizeAdminSessionMessage(message: string, locale: ResolvedLocale): string {
  const key = sessionCopyKeys[message as keyof typeof sessionCopyKeys];
  return key ? adminMessages[locale].copy[key] : message;
}

