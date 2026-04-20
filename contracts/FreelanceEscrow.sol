// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FreelanceEscrow
 * @author HEC Capstone Team — Spring 2026
 * @notice Decentralized escrow for freelance projects with milestone-based payments.
 * @dev Payments in a single ERC-20 token (e.g., USDC) set at deployment.
 *      Features: auto-release after deadline, cancel/refund, dispute with split resolution.
 */
contract FreelanceEscrow is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant AUTO_RELEASE_DELAY = 14 days;
    uint256 public constant MAX_FEE_BPS = 1000; // 10% maximum
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 200;

    /*//////////////////////////////////////////////////////////////
                                STATE
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable paymentToken;

    uint256 public defaultPlatformFeeBps = 200; // 2%
    uint256 public accumulatedFees;
    uint256 public projectCount;

    mapping(uint256 => Project) private _projects;
    mapping(address => uint256[]) private _clientProjects;
    mapping(address => uint256[]) private _freelancerProjects;

    /*//////////////////////////////////////////////////////////////
                                TYPES
    //////////////////////////////////////////////////////////////*/

    enum MilestoneStatus {
        Pending,
        Completed,
        Approved,
        Claimed,
        Refunded,
        Disputed
    }

    enum ProjectStatus {
        Active,
        Cancelled,
        Completed,
        Disputed
    }

    struct Milestone {
        string description;
        uint256 amount;
        uint64 completedAt;
        uint64 approvedAt;
        MilestoneStatus status;
    }

    struct Project {
        address client;
        address freelancer;
        uint256 totalAmount;
        uint256 platformFeeBps; // locked at creation
        uint64 createdAt;
        ProjectStatus status;
        Milestone[] milestones;
        string disputeReason;
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address indexed freelancer,
        uint256 totalAmount,
        uint256 milestoneCount,
        uint256 platformFeeBps
    );

    event MilestoneCompleted(
        uint256 indexed projectId,
        uint256 indexed milestoneIdx,
        uint64 completedAt
    );

    event MilestoneApproved(
        uint256 indexed projectId,
        uint256 indexed milestoneIdx,
        uint256 amountToFreelancer,
        uint256 platformFee
    );

    event MilestoneClaimed(
        uint256 indexed projectId,
        uint256 indexed milestoneIdx,
        uint256 amountToFreelancer,
        uint256 platformFee
    );

    event ProjectCancelled(uint256 indexed projectId, uint256 refundedAmount);

    event DisputeRaised(
        uint256 indexed projectId,
        uint256 indexed milestoneIdx,
        address indexed raiser,
        string reason
    );

    event DisputeResolved(
        uint256 indexed projectId,
        uint256 indexed milestoneIdx,
        uint256 amountToFreelancer,
        uint256 amountToClient
    );

    event FeesWithdrawn(address indexed to, uint256 amount);
    event DefaultFeeUpdated(uint256 oldFee, uint256 newFee);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidAddress();
    error InvalidAmount();
    error InvalidMilestones();
    error DescriptionTooLong();
    error ProjectNotFound();
    error Unauthorized();
    error InvalidMilestoneStatus();
    error InvalidProjectStatus();
    error AutoReleaseNotReached();
    error FeeTooHigh();
    error DisputeSplitMismatch();
    error NothingToRefund();

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _paymentToken) Ownable(msg.sender) {
        if (_paymentToken == address(0)) revert InvalidAddress();
        paymentToken = IERC20(_paymentToken);
    }

    /*//////////////////////////////////////////////////////////////
                          CORE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Create a new escrow project. Client must have approved this contract
     *         to spend at least the sum of milestone amounts before calling.
     * @param freelancer The freelancer address.
     * @param descriptions Array of milestone descriptions.
     * @param amounts Array of milestone amounts in token units (same length as descriptions).
     * @return projectId The id of the new project.
     */
    function createProject(
        address freelancer,
        string[] calldata descriptions,
        uint256[] calldata amounts
    ) external whenNotPaused nonReentrant returns (uint256 projectId) {
        if (freelancer == address(0)) revert InvalidAddress();
        if (freelancer == msg.sender) revert InvalidAddress();

        uint256 len = descriptions.length;
        if (len == 0 || len > MAX_MILESTONES) revert InvalidMilestones();
        if (len != amounts.length) revert InvalidMilestones();

        uint256 total;
        for (uint256 i; i < len; ++i) {
            if (amounts[i] == 0) revert InvalidAmount();
            if (bytes(descriptions[i]).length > MAX_DESCRIPTION_LENGTH) revert DescriptionTooLong();
            total += amounts[i];
        }

        // Effects
        projectId = projectCount++;
        Project storage p = _projects[projectId];
        p.client = msg.sender;
        p.freelancer = freelancer;
        p.totalAmount = total;
        p.platformFeeBps = defaultPlatformFeeBps;
        p.createdAt = uint64(block.timestamp);
        p.status = ProjectStatus.Active;

        for (uint256 i; i < len; ++i) {
            p.milestones.push(
                Milestone({
                    description: descriptions[i],
                    amount: amounts[i],
                    completedAt: 0,
                    approvedAt: 0,
                    status: MilestoneStatus.Pending
                })
            );
        }

        _clientProjects[msg.sender].push(projectId);
        _freelancerProjects[freelancer].push(projectId);

        emit ProjectCreated(projectId, msg.sender, freelancer, total, len, p.platformFeeBps);

        // Interaction — last (CEI)
        paymentToken.safeTransferFrom(msg.sender, address(this), total);
    }

    /**
     * @notice Freelancer marks a milestone as completed.
     */
    function completeMilestone(uint256 projectId, uint256 milestoneIdx)
        external
        whenNotPaused
    {
        Project storage p = _getProject(projectId);
        if (msg.sender != p.freelancer) revert Unauthorized();
        if (p.status != ProjectStatus.Active) revert InvalidProjectStatus();
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();

        Milestone storage m = p.milestones[milestoneIdx];
        if (m.status != MilestoneStatus.Pending) revert InvalidMilestoneStatus();

        m.status = MilestoneStatus.Completed;
        m.completedAt = uint64(block.timestamp);

        emit MilestoneCompleted(projectId, milestoneIdx, m.completedAt);
    }

    /**
     * @notice Client approves a completed milestone and releases payment to freelancer.
     */
    function approveMilestone(uint256 projectId, uint256 milestoneIdx)
        external
        whenNotPaused
        nonReentrant
    {
        Project storage p = _getProject(projectId);
        if (msg.sender != p.client) revert Unauthorized();
        if (p.status != ProjectStatus.Active) revert InvalidProjectStatus();
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();

        Milestone storage m = p.milestones[milestoneIdx];
        if (m.status != MilestoneStatus.Completed) revert InvalidMilestoneStatus();

        _releaseMilestone(p, m, projectId, milestoneIdx, MilestoneStatus.Approved);
    }

    /**
     * @notice Freelancer claims payment after the auto-release deadline.
     * @dev Protects freelancer if client goes unresponsive.
     */
    function claimExpiredMilestone(uint256 projectId, uint256 milestoneIdx)
        external
        whenNotPaused
        nonReentrant
    {
        Project storage p = _getProject(projectId);
        if (msg.sender != p.freelancer) revert Unauthorized();
        if (p.status != ProjectStatus.Active && p.status != ProjectStatus.Cancelled) {
            revert InvalidProjectStatus();
        }
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();

        Milestone storage m = p.milestones[milestoneIdx];
        if (m.status != MilestoneStatus.Completed) revert InvalidMilestoneStatus();
        if (block.timestamp < m.completedAt + AUTO_RELEASE_DELAY) revert AutoReleaseNotReached();

        _releaseMilestone(p, m, projectId, milestoneIdx, MilestoneStatus.Claimed);
    }

    /**
     * @notice Client cancels the project and recovers funds for non-started milestones.
     * @dev Milestones already Completed remain claimable by the freelancer.
     */
    function cancelProject(uint256 projectId)
        external
        whenNotPaused
        nonReentrant
    {
        Project storage p = _getProject(projectId);
        if (msg.sender != p.client) revert Unauthorized();
        if (p.status != ProjectStatus.Active) revert InvalidProjectStatus();

        uint256 refund;
        uint256 len = p.milestones.length;
        for (uint256 i; i < len; ++i) {
            Milestone storage m = p.milestones[i];
            if (m.status == MilestoneStatus.Pending) {
                m.status = MilestoneStatus.Refunded;
                refund += m.amount;
            }
        }

        if (refund == 0) revert NothingToRefund();

        p.status = ProjectStatus.Cancelled;

        emit ProjectCancelled(projectId, refund);
        paymentToken.safeTransfer(p.client, refund);
    }

    /*//////////////////////////////////////////////////////////////
                             DISPUTES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Either party can raise a dispute on a Completed milestone.
     * @dev Freezes auto-release until owner resolves it.
     */
    function raiseDispute(
        uint256 projectId,
        uint256 milestoneIdx,
        string calldata reason
    ) external whenNotPaused {
        Project storage p = _getProject(projectId);
        if (msg.sender != p.client && msg.sender != p.freelancer) revert Unauthorized();
        if (p.status != ProjectStatus.Active) revert InvalidProjectStatus();
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();
        if (bytes(reason).length > MAX_DESCRIPTION_LENGTH) revert DescriptionTooLong();

        Milestone storage m = p.milestones[milestoneIdx];
        if (m.status != MilestoneStatus.Completed) revert InvalidMilestoneStatus();

        m.status = MilestoneStatus.Disputed;
        p.status = ProjectStatus.Disputed;
        p.disputeReason = reason;

        emit DisputeRaised(projectId, milestoneIdx, msg.sender, reason);
    }

    /**
     * @notice Owner resolves a dispute by splitting the milestone amount between parties.
     * @param amountToFreelancer Portion sent to freelancer (gross, before fee).
     * @param amountToClient Portion refunded to client.
     * @dev amountToFreelancer + amountToClient MUST equal milestone.amount exactly.
     */
    function resolveDispute(
        uint256 projectId,
        uint256 milestoneIdx,
        uint256 amountToFreelancer,
        uint256 amountToClient
    ) external onlyOwner nonReentrant {
        Project storage p = _getProject(projectId);
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();

        Milestone storage m = p.milestones[milestoneIdx];
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (amountToFreelancer + amountToClient != m.amount) revert DisputeSplitMismatch();

        m.status = MilestoneStatus.Approved;
        m.approvedAt = uint64(block.timestamp);
        p.status = ProjectStatus.Active;
        p.disputeReason = "";

        if (_isProjectFullyResolved(p)) {
            p.status = ProjectStatus.Completed;
        }

        // Fee applies only on freelancer's portion
        uint256 fee = (amountToFreelancer * p.platformFeeBps) / BPS_DENOMINATOR;
        uint256 netToFreelancer = amountToFreelancer - fee;
        accumulatedFees += fee;

        emit DisputeResolved(projectId, milestoneIdx, amountToFreelancer, amountToClient);

        if (netToFreelancer > 0) paymentToken.safeTransfer(p.freelancer, netToFreelancer);
        if (amountToClient > 0) paymentToken.safeTransfer(p.client, amountToClient);
    }

    /*//////////////////////////////////////////////////////////////
                               ADMIN
    //////////////////////////////////////////////////////////////*/

    function withdrawFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NothingToRefund();
        accumulatedFees = 0;
        emit FeesWithdrawn(to, amount);
        paymentToken.safeTransfer(to, amount);
    }

    function setDefaultPlatformFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 old = defaultPlatformFeeBps;
        defaultPlatformFeeBps = newFeeBps;
        emit DefaultFeeUpdated(old, newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getProject(uint256 projectId)
        external
        view
        returns (
            address client,
            address freelancer,
            uint256 totalAmount,
            uint256 platformFeeBps,
            uint64 createdAt,
            ProjectStatus status,
            uint256 milestoneCount,
            string memory disputeReason
        )
    {
        Project storage p = _projects[projectId];
        if (p.client == address(0)) revert ProjectNotFound();
        return (
            p.client,
            p.freelancer,
            p.totalAmount,
            p.platformFeeBps,
            p.createdAt,
            p.status,
            p.milestones.length,
            p.disputeReason
        );
    }

    function getMilestone(uint256 projectId, uint256 milestoneIdx)
        external
        view
        returns (Milestone memory)
    {
        Project storage p = _projects[projectId];
        if (p.client == address(0)) revert ProjectNotFound();
        if (milestoneIdx >= p.milestones.length) revert InvalidMilestones();
        return p.milestones[milestoneIdx];
    }

    function getAllMilestones(uint256 projectId)
        external
        view
        returns (Milestone[] memory)
    {
        Project storage p = _projects[projectId];
        if (p.client == address(0)) revert ProjectNotFound();
        return p.milestones;
    }

    function getProjectsByClient(address client) external view returns (uint256[] memory) {
        return _clientProjects[client];
    }

    function getProjectsByFreelancer(address freelancer) external view returns (uint256[] memory) {
        return _freelancerProjects[freelancer];
    }

    /*//////////////////////////////////////////////////////////////
                             INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _getProject(uint256 projectId) internal view returns (Project storage p) {
        p = _projects[projectId];
        if (p.client == address(0)) revert ProjectNotFound();
    }

    function _releaseMilestone(
        Project storage p,
        Milestone storage m,
        uint256 projectId,
        uint256 milestoneIdx,
        MilestoneStatus newStatus
    ) internal {
        m.status = newStatus;
        m.approvedAt = uint64(block.timestamp);

        uint256 fee = (m.amount * p.platformFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = m.amount - fee;
        accumulatedFees += fee;

        if (p.status == ProjectStatus.Active && _isProjectFullyResolved(p)) {
            p.status = ProjectStatus.Completed;
        }

        if (newStatus == MilestoneStatus.Approved) {
            emit MilestoneApproved(projectId, milestoneIdx, netAmount, fee);
        } else {
            emit MilestoneClaimed(projectId, milestoneIdx, netAmount, fee);
        }

        paymentToken.safeTransfer(p.freelancer, netAmount);
    }

    function _isProjectFullyResolved(Project storage p) internal view returns (bool) {
        uint256 len = p.milestones.length;
        for (uint256 i; i < len; ++i) {
            MilestoneStatus s = p.milestones[i].status;
            if (s == MilestoneStatus.Pending || s == MilestoneStatus.Completed) {
                return false;
            }
        }
        return true;
    }
}
